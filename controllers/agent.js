/**
 ============================================================================
 CONTROLLER: Rentlyst AI Agent
 ============================================================================
 * This controller handles the core logic for the Rentlyst AI Assistant.
 * It uses a highly optimized "Dual-Path Streaming Architecture":
 - PATH A (Chit-Chat): Fast, conversational responses.
 - PATH B (Search): Vector search + Contextual summary in a single UI bubble.
 * Key Technologies: MongoDB Atlas Vector Search, Server-Sent Events (SSE), OpenRouter.
 */

const Conversation = require('../models/conversation');
const Profile = require('../models/profile');
const Listing = require('../models/listing');
const { generateEmbedding, cosineSimilarity } = require('../utils/embedding');
const openai = require('../utils/openai');
const CATEGORIES = require('../utils/categories');

const rawModels = process.env.OPENROUTER_FALLBACK_MODELS || "";
const LLM_MODELS = rawModels.split(',').map(m => m.trim()).filter(Boolean);

// Per-user message rate limiter — max 1 message per 2 seconds
const messageCooldown = new Map();
const MESSAGE_COOLDOWN_MS = 2000;

// ==========================================
// 1. HELPER: CONTEXT & PROFILE MANAGEMENT
// ==========================================

// Per-user cooldown: prevents summarization from firing more than once per 30s per user
const summarizeCooldown = new Map(); // userId -> last run timestamp (ms)
const SUMMARIZE_COOLDOWN_MS = 30 * 1000; // 30 seconds

/**
 * [FUNCTION 1]: summarizeUnsummarizedChats
 * Analyzes recent chat messages in the background to update the UserProfile "Dossier".
 * This gives the AI long-term memory of the user's preferences without bloating the prompt.
 */
async function summarizeUnsummarizedChats(userId) {
    const userKey = userId.toString();
    const now = Date.now();
    const lastRun = summarizeCooldown.get(userKey) || 0;

    if (now - lastRun < SUMMARIZE_COOLDOWN_MS) return;
    summarizeCooldown.set(userKey, now);

    try {
        const conversations = await Conversation.find({
            user: userId,
            'messages.0': { $exists: true }
        });

        if (!conversations || conversations.length === 0) return;

        const profile = await Profile.findOne({ user: userId });
        if (!profile) return;

        for (const conv of conversations) {
            const totalMsgs = conv.messages.length;
            const lastIdx = conv.lastSummarizedIndex || 0;
            const newMsgCount = totalMsgs - lastIdx;

            // Only process if there are at least 3 new messages
            if (newMsgCount < 3) continue;

            const newMessages = conv.messages.slice(lastIdx);
            const chatText = newMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

            // STEP 1: Extract fresh insights from the current conversation
            const summaryPrompt = `Analyze the chat to update the "Manager's Dossier" for this client. 
Focus ONLY on:
- Active Focus & Pivots: (What are they looking for RIGHT NOW? Did they switch from Cars to Items?)
- Buying/Renting Triggers: (Low price? Performance? Prestige? Reliability?)
- Hard Objections: (Specific things they rejected: "No Karachi listings", "Too expensive".)
- Identity & Facts: (Any mention of Name, School, Job, or Age.)

Rules:
1. Write this as a short, punchy briefing.
2. If no new psychological or strategic insights are found, reply: "NO_NEW_INFO"

Messages:
${chatText}`;

            const result = await callLLMWithFallback([{ role: 'user', content: summaryPrompt }], 400);
            const newInsights = (result?.choices?.[0]?.message?.content || '').trim();

            if (newInsights && !newInsights.includes('NO_NEW_INFO') && newInsights.length > 5) {

                // STEP 2: The "Smart Merge" - Refine the existing Dossier with new info
                const mergePrompt = `
You are a Senior Data Manager. Your task is to update the current "Manager's Dossier" with new insights.

CURRENT DOSSIER:
${profile.agentContext || "No context gathered yet."}

NEW INSIGHTS:
${newInsights}

STRICT INSTRUCTIONS:
1. Integrate new insights into the dossier.
2. DELETE/FLUSH outdated information (e.g., if the user moved from Cars to Houses, remove the specific car models they were looking at).
3. PROTECT Identity facts (Name, University, Profession).
4. Keep the output clean, organized by labels (Triggers, Objections, Vibe), and under 1000 characters.
5. Output the UPDATED DOSSIER only.`;

                const mergeResult = await callLLMWithFallback([{ role: 'user', content: mergePrompt }], 600);
                const updatedDossier = (mergeResult?.choices?.[0]?.message?.content || '').trim();

                if (updatedDossier && updatedDossier.length > 5) {
                    // This replaces the old messy text with the clean, pruned version
                    profile.agentContext = updatedDossier;
                }
            }

            // Mark these messages as processed
            conv.lastSummarizedIndex = totalMsgs;
            await conv.save();
        }

        // Save the cleaned-up profile context
        await profile.save();

    } catch (err) {
        console.error('Error during smart summarization:', err.message || err);
    }
}

/**
 * [FUNCTION 2]: buildSlidingHistory
 * Extracts the last N messages to provide immediate context for the AI model.
 * Merges consecutive identical roles to prevent OpenAI API errors.
 */
function buildSlidingHistory(messages) {
    if (!messages || messages.length === 0) return [];

    // Take the last 6 messages to keep context short and sweet
    const recent = messages.slice(-6).map(m => ({
        role: m.role === 'agent' ? 'assistant' : 'user',
        content: m.content
    }));

    // Sanitize: OpenAI strictly forbids consecutive 'user' or 'assistant' messages.
    const sanitized = [];
    for (const msg of recent) {
        if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === msg.role) {
            sanitized[sanitized.length - 1].content += "\n\n" + msg.content;
        } else {
            sanitized.push({ role: msg.role, content: msg.content });
        }
    }

    // Ensure the last message in history isn't user (the new query handles that)
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === 'user') {
        sanitized.pop();
    }

    return sanitized;
}

// ==========================================
// 2. HELPER: VECTOR SEARCH ENGINE
// ==========================================

/**
 * [FUNCTION 3]: performSearch
 * Strict-to-Relaxed Vector Search Engine.
 * - Attempt 1: Atlas $vectorSearch with strict filters (category + city + specs).
 * - Attempt 2: Relaxed search (drops specific specs, keeps category + city).
 * - Fallback: Standard cosine similarity scan if Atlas index is unavailable.
 */
async function performSearch(queryVector, filters = {}) {
    const buildAtlasFilter = (includeSpecs) => {
        const andClauses = [];

        if (filters.mainCategory && filters.mainCategory !== null) andClauses.push({ mainCategory: { $eq: filters.mainCategory } });
        if (filters.subCategory && filters.subCategory !== null) andClauses.push({ subCategory: { $eq: filters.subCategory } });
        if (filters.city && filters.city !== null) andClauses.push({ city: { $eq: filters.city } });
        if (filters.listingType && filters.listingType !== null) andClauses.push({ listingType: { $eq: filters.listingType } });

        if (includeSpecs && filters.specifications) {
            const specs = filters.specifications;
            if (specs.make && specs.make !== null) andClauses.push({ 'specifications.make': { $eq: specs.make } });
            if (specs.year && specs.year !== null) andClauses.push({ 'specifications.year': { $eq: specs.year } });
            if (specs.bedrooms && specs.bedrooms !== null) andClauses.push({ 'specifications.bedrooms': { $eq: specs.bedrooms } });
        }

        return andClauses.length > 0 ? { $and: andClauses } : undefined;
    };

    const runAtlasSearch = async (filter) => {
        const pipeline = [
            {
                $vectorSearch: {
                    index: 'listing_vector_index',
                    path: 'listingVector',
                    queryVector,
                    numCandidates: 250,
                    limit: 10,
                    ...(filter ? { filter } : {})
                }
            },
            {
                $project: {
                    title: 1,
                    city: 1,
                    listingType: 1,
                    price: 1,
                    rentalPeriod: 1,
                    image: 1,
                    searchContext: 1,
                    mainCategory: 1,
                    subCategory: 1,
                    specifications: 1,
                    score: { $meta: 'vectorSearchScore' }
                }
            }
        ];
        return await Listing.aggregate(pipeline);
    };

    // --- Attempt 1: Atlas strict search (with specs) ---
    try {
        const strictFilter = buildAtlasFilter(true);

        // NEW SAFETY GATE: 
        // If the LLM failed to find a category AND there are no specs, 
        // don't let Atlas return the whole database.
        const isQueryEmpty = !filters.mainCategory && !filters.subCategory && !filters.city;

        if (isQueryEmpty && (!queryVector || queryVector.length === 0)) {
            console.log("[Search] Query is too vague, skipping search to prevent random results.");
            const emptyResults = [];
            emptyResults.isRelaxed = false;
            return emptyResults;
        }

        const strictResults = await runAtlasSearch(strictFilter);
        console.log(`[Search] Strict Atlas: ${strictResults.length} results`);
        if (strictResults.length > 0) {
            strictResults.isRelaxed = false;
            return strictResults;
        }

        // --- Attempt 2: Relaxed (drop specs, keep category+city+type) ---
        const relaxedFilter = buildAtlasFilter(false);
        const relaxedResults = await runAtlasSearch(relaxedFilter);
        console.log(`[Search] Relaxed Atlas: ${relaxedResults.length} results`);
        relaxedResults.isRelaxed = relaxedResults.length > 0;
        return relaxedResults;

    } catch (atlasErr) {
        console.warn('[Atlas Vector Search] Not available, falling back to JS cosine scan:', atlasErr.message);
    }

    // --- JS cosine fallback (no Atlas index) ---
    const fallbackQuery = {
        listingVector: { $exists: true, $ne: [] }
    };
    // Add these to make the fallback smarter and more precise
    if (filters.mainCategory) fallbackQuery.mainCategory = filters.mainCategory;
    if (filters.subCategory) fallbackQuery.subCategory = filters.subCategory;
    if (filters.city) fallbackQuery.city = filters.city;
    if (filters.listingType) fallbackQuery.listingType = filters.listingType;
    if (filters.country) fallbackQuery.country = filters.country;

    const listings = await Listing.find(fallbackQuery).limit(500);

    const scored = listings
        .map(l => ({ ...l.toObject(), score: cosineSimilarity(queryVector, l.listingVector) })) // [AI CALL]: Uses embedding.js (cosineSimilarity) as fallback
        .filter(l => l.score > 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    scored.isRelaxed = false;
    return scored;
}

// ==========================================
// 3. HELPER: AI COMMUNICATION LAYERS
// ==========================================

/**
 * [FUNCTION 4]: callLLMWithFallback
 * Synchronous LLM calls (used for intent extraction, summarization).
 * Automatically fails over to backup models if the primary model goes down.
 */
async function callLLMWithFallback(messages, max_tokens) {
    let lastErr;
    for (const model of LLM_MODELS) {
        try {
            // [AI CALL]: Uses openai.js for non-streaming completions (intent extraction, summarization)
            return await openai.chat.completions.create({ model, messages, max_tokens });
        } catch (err) {
            console.warn(`[Fallback Warning] Model ${model} failed, trying next if available...`, err.message);
            lastErr = err;
        }
    }
    throw lastErr;
}

/**
 * [FUNCTION 5]: callLLMStreamWithFallback
 * Streaming LLM calls (used for real-time UI chat updates).
 * Returns { stream, model } for the first model that succeeds.
 */
async function callLLMStreamWithFallback(messages, max_tokens) {
    let lastErr;
    for (const model of LLM_MODELS) {
        try {
            // [AI CALL]: Uses openai.js for streaming response (SSE)
            const stream = await openai.chat.completions.create({
                model,
                messages,
                max_tokens,
                stream: true
            });
            return { stream, model };
        } catch (err) {
            console.warn(`[Stream Fallback] Model ${model} failed, trying next...`, err.message);
            lastErr = err;
        }
    }
    throw lastErr;
}

// ==========================================
// 4. MAIN EXPORT CONTROLLERS
// ==========================================

/**
 * [CONTROLLER 1]: renderAgent
 * Renders the main agent interface view.
 * Triggers a background summarization task to ensure the Dossier is fresh on load.
 */
module.exports.renderAgent = async (req, res) => {
    try {
        const conversations = await Conversation.find({ user: req.user._id })
            .sort({ updatedAt: -1 })
            .select('title updatedAt')
            .lean();

        const profile = await Profile.findOne({ user: req.user._id }).lean();
        const profileImg = profile && profile.profileImg && profile.profileImg.url
            ? profile.profileImg.url
            : 'https://images.pexels.com/photos/13305201/pexels-photo-13305201.jpeg';

        // TRIGGER ON LOAD: This cleans up the Dossier the moment you open the app.
        // It processes any messages sent right before you last closed the browser.
        summarizeUnsummarizedChats(req.user._id).catch(e =>
            console.error("[Summarizer Initial Load Error]:", e.message || e)
        );

        res.render('agent/agent.ejs', { conversations, profileImg });
    } catch (err) {
        console.error('Error rendering agent page:', err);
        res.status(500).send('Internal Server Error');
    }
};
/**
 * [CONTROLLER 2]: handleMessage
 * The core engine of the AI. Handles real-time SSE streaming and dual-path logic.
 * 
 * Architecture Flow:
 * - Phase 1: Context Loading -> Loads chat history and user dossier from DB.
 * - Phase 2: Prime Agent (LLM #1) -> Streams chat live to UI while predicting user intent.
 * - Phase 3: Route Decision -> Parses intent JSON to decide between Path A or Path B.
 * - Phase 4 (Path A): Saves conversation and ends stream.
 * - Phase 5 (Path B): Performs Vector Search -> Streams LLM #2 Advisor Response with search results.
 */
module.exports.handleMessage = async (req, res) => {
    try {
        const { message, conversationId } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }
        if (message.trim().length > 800) {
            return res.status(400).json({ error: 'Message is too long. Please keep it under 800 characters.' });
        }

        // ── Rate Limit: 1 message per 2 seconds per user ──
        const userId = req.user._id.toString();
        const now = Date.now();
        const lastMsg = messageCooldown.get(userId) || 0;
        if (now - lastMsg < MESSAGE_COOLDOWN_MS) {
            return res.status(429).json({ error: 'Slow down! Wait a moment before sending another message.' });
        }
        messageCooldown.set(userId, now);

        // ── Step 1: Rapid Local DB Fetches ──
        const [existingConversation, userProfile] = await Promise.all([
            conversationId
                ? Conversation.findOne({ _id: conversationId, user: req.user._id })
                : Promise.resolve(null),
            Profile.findOne({ user: req.user._id })
        ]);

        let conversation = existingConversation;
        if (!conversation) {
            summarizeUnsummarizedChats(req.user._id).catch(e => console.error(e));
            conversation = new Conversation({
                user: req.user._id,
                title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
                messages: [],
                lastSummarizedIndex: 0
            });
        }
        const chatHistory = buildSlidingHistory(conversation.messages);

        // Resolve user context from profile
        const userContextInfo = userProfile && userProfile.agentContext
            ? userProfile.agentContext
            : 'No historical context gathered yet.';
        const userDisplayName = userProfile && userProfile.fullName
            ? userProfile.fullName
            : (userProfile && userProfile.username ? userProfile.username : 'the user');

        // ── Step 2: Prime Agent — Streaming LLM #1 ──
        // Single streaming call that simultaneously engages the user ([CHAT] section)
        // and extracts search intent ([INTENT] JSON section).
        // [CHAT] tokens are forwarded to the client live for instant TTFT.
        // [INTENT] block is buffered and parsed after the stream ends.
        const catsJSON = JSON.stringify(CATEGORIES);

        // The Prime Agent prompt: two strict output sections in one call.
        // CHAT section: personalized, uses dossier + history.
        // INTENT section: purely from the latest user message — no context contamination.
        const primeAgentSystemPrompt = `You are "Rentlyst Prime" — a sharp, professional marketplace assistant.
Your job is to respond to the user AND decide if a listing search is needed, in ONE single output.

You MUST output EXACTLY two sections with these delimiters, in this order:

[CHAT]
Your natural language reply to the user. Be engaging, professional and personalized.
Use the User Dossier and chat history to build rapport.
If needsSearch will be true: keep this SHORT (2-3 sentences max) — just acknowledge the request and say you are searching inventory. e.g. "On it — pulling up the best [item] options in [city] for you right now."
If needsSearch will be false: give a full helpful reply here.
[/CHAT]
[INTENT]
{"needsSearch": <boolean>, "searchQuery": "<rich 2-3 sentence description for vector search>", "filters": {"mainCategory": "<Item|Vehicle|Property|Service|null>", "subCategory": "<exact string from Valid Categories|null>", "listingType": "<Sale|Rent|null>", "city": "<Standardized city|null>", "country": "<Standardized country|null>", "specifications": {"make": "<string|null>", "year": "<number|null>", "bedrooms": "<number|null>"}}}
[/INTENT]

INTENT RULES (STRICT — no exceptions):
- The [INTENT] block MUST be derived ONLY from the latest user message. Ignore all history and dossier for intent.
- needsSearch=true if the user is asking for any searchable item, vehicle, property, or service (even partial).
- needsSearch=false for greetings, chit-chat, follow-up questions, or non-search requests.
- Map slang to exact categories: "Bike/Heavy Bike/Scooty" → Vehicle/Motorcycles. "Flat/Penthouse/1BHK" → Property/Apartments & Flats. "Plot/File" → Property/Land & Plots. "iPhone/Laptop/Tab" → Item/Tech. "Electrician/Plumber" → Service/Home Services.
- Fix typos: "Mehraan"→Mehran, "Civicc"→Civic. Expand: "LHR"→Lahore, "KHI"→Karachi, "ISB"→Islamabad, "Pindi"→Rawalpindi.
- Output ONLY valid JSON inside [INTENT] — no extra text.

Valid Categories for INTENT mapping: ${catsJSON}

USER DOSSIER (use for [CHAT] only):
User Name: ${userDisplayName || 'Valued Client'}
Identity/Preferences: ${userContextInfo}`;

        // Open SSE headers immediately — before any LLM call — so the client
        // starts receiving data the moment the first token arrives from LLM #1.
        if (conversation.isNew) await conversation.save();
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        // Send metadata immediately (conversation ID)
        res.write(`data: ${JSON.stringify({
            type: 'meta',
            conversationId: conversation._id,
            conversationTitle: conversation.title
        })}\n\n`);

        // ── Stream LLM #1 and parse dual-section output ──
        const primeMessages = [
            { role: 'system', content: primeAgentSystemPrompt },
            ...chatHistory,
            { role: 'user', content: message }
        ];

        // Token budget: generous enough for a full chit-chat reply + INTENT JSON
        const { stream: primeStream } = await callLLMStreamWithFallback(primeMessages, 900);

        let primeFullOutput = '';
        let inChatSection = false;
        let chatSectionDone = false;
        let forwardedChat = '';    // clean text we actually sent to client
        let forwardBuffer = '';   // chars held back to prevent partial-tag leakage
        let preTagBuffer = '';    // chars before [CHAT] opens
        const LOOKAHEAD = 12;     // hold back enough chars to catch any delimiter

        // State machine: forward [CHAT] tokens live, never leak delimiters to client
        for await (const chunk of primeStream) {
            const rawDelta = chunk.choices[0]?.delta;
            let delta = '';
            if (typeof rawDelta?.content === 'string') {
                delta = rawDelta.content;
            } else if (Array.isArray(rawDelta?.content)) {
                delta = rawDelta.content.filter(b => b.type === 'text').map(b => b.text || '').join('');
            }
            if (!delta) continue;

            primeFullOutput += delta;

            if (chatSectionDone) continue; // already past [CHAT] section

            // Stop condition: [/CHAT] or [INTENT] has fully appeared
            const stopDetected = primeFullOutput.includes('[/CHAT]') || primeFullOutput.includes('[INTENT]');

            if (stopDetected) {
                chatSectionDone = true;
                // Flush the exact remaining characters of the [CHAT] block
                const chatMatch = primeFullOutput.match(/\[CHAT\]([\s\S]*?)(\[\/CHAT\]|\[INTENT\])/);
                if (chatMatch) {
                    const fullChatText = chatMatch[1];
                    if (fullChatText.length > forwardedChat.length) {
                        const unsent = fullChatText.slice(forwardedChat.length);
                        forwardedChat += unsent;
                        res.write(`data: ${JSON.stringify({ type: 'token', content: unsent })}\n\n`);
                    }
                }
                forwardBuffer = '';
            } else if (!inChatSection) {
                // Still looking for [CHAT] opening tag
                preTagBuffer += delta;
                if (preTagBuffer.includes('[CHAT]')) {
                    inChatSection = true;
                    const afterTag = preTagBuffer.split('[CHAT]').slice(1).join('[CHAT]');
                    forwardBuffer = afterTag;
                    preTagBuffer = '';
                    // Flush safe portion of forwardBuffer (hold back LOOKAHEAD chars)
                    if (forwardBuffer.length > LOOKAHEAD) {
                        const toFlush = forwardBuffer.slice(0, forwardBuffer.length - LOOKAHEAD);
                        forwardedChat += toFlush;
                        res.write(`data: ${JSON.stringify({ type: 'token', content: toFlush })}\n\n`);
                        forwardBuffer = forwardBuffer.slice(-LOOKAHEAD);
                    }
                }
            } else {
                // Inside [CHAT], no stop tag yet — flush with lookahead buffer
                forwardBuffer += delta;
                if (forwardBuffer.length > LOOKAHEAD) {
                    const toFlush = forwardBuffer.slice(0, forwardBuffer.length - LOOKAHEAD);
                    forwardedChat += toFlush;
                    res.write(`data: ${JSON.stringify({ type: 'token', content: toFlush })}\n\n`);
                    forwardBuffer = forwardBuffer.slice(-LOOKAHEAD);
                }
            }
        }

        // ── Parse [INTENT] from the full LLM #1 output ──
        let queryAnalysis = { needsSearch: false, searchQuery: message, filters: {} };
        try {
            const intentMatch = primeFullOutput.match(/\[INTENT\]([\s\S]*?)\[\/INTENT\]/);
            if (!intentMatch) throw new Error('No [INTENT] block found in prime output.');
            const intentRaw = intentMatch[1].trim().replace(/```json/gi, '').replace(/```/g, '').trim();
            const jsonMatch = intentRaw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON object in [INTENT] block.');
            const parsed = JSON.parse(jsonMatch[0]);
            console.log('[Prime Agent] needsSearch:', parsed.needsSearch, '| query:', parsed.searchQuery);
            console.log('[Prime Agent] filters:', JSON.stringify(parsed.filters));
            queryAnalysis = {
                needsSearch: !!parsed.needsSearch,
                searchQuery: parsed.searchQuery || message,
                filters: parsed.filters || {}
            };
        } catch (parseErr) {
            console.warn('[Prime Agent] INTENT parse failed, defaulting to no-search. Reason:', parseErr.message);
        }

        // Extract the clean [CHAT] text for DB saving (Path A uses this)
        const chatMatch = primeFullOutput.match(/\[CHAT\]([\s\S]*?)\[\/CHAT\]/);
        const primeChat = chatMatch ? chatMatch[1].trim() : forwardedChat.trim();

        // ── PATH A: No search needed — done after LLM #1 ──
        if (!queryAnalysis.needsSearch) {
            // Retrieve previous listings from the conversation state for context continuity
            let previousIds = [];
            for (let i = conversation.messages.length - 1; i >= 0; i--) {
                if (conversation.messages[i].role === 'agent' && conversation.messages[i].matchedListings?.length > 0) {
                    previousIds = conversation.messages[i].matchedListings;
                    break;
                }
            }
            if (previousIds.length > 0) {
                const prevListings = await Listing.find({ _id: { $in: previousIds } }).select('title city listingType price rentalPeriod image').lean();
                const prevPayload = prevListings.map(l => ({
                    _id: l._id, title: l.title, city: l.city, listingType: l.listingType,
                    price: l.price, rentalPeriod: l.rentalPeriod,
                    image: l.image && l.image.length > 0 ? l.image[0].url : ''
                }));
                if (prevPayload.length > 0) {
                    res.write(`data: ${JSON.stringify({ type: 'listings', matchedListings: prevPayload })}\n\n`);
                }
            }

            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            res.end();

            console.log(`[Prime Agent Path A] Chat response length: ${primeChat.length} chars`);

            if (primeChat) {
                conversation.messages.push({ role: 'user', content: message, matchedListings: [] });
                conversation.messages.push({ role: 'agent', content: primeChat, matchedListings: previousIds });
                await conversation.save();
                const unsummarizedCount = conversation.messages.length - (conversation.lastSummarizedIndex || 0);
                if (unsummarizedCount >= 3) {
                    summarizeUnsummarizedChats(req.user._id).catch(e => console.error('[Summarizer Error]:', e));
                }
                console.log(`[Agent DB] Saved conversation ${conversation._id}`);
            }
            return;
        }

        // ── PATH B: Search needed — emit 'searching', run embedding+search, stream LLM #2 ──
        res.write(`data: ${JSON.stringify({ type: 'searching' })}\n\n`);

        // ── Step 3: Embed & Search ──
        let matchedListingsDocs = [];
        let searchWasRelaxed = false;
        try {
            // [AI CALL]: Uses embedding.js to generate vector for user search query
            const queryVector = await generateEmbedding(queryAnalysis.searchQuery, 'query');
            if (queryVector) {
                matchedListingsDocs = await performSearch(queryVector, queryAnalysis.filters);
                searchWasRelaxed = matchedListingsDocs.isRelaxed === true;
            }
        } catch (searchErr) {
            console.error('[Search] Vector search failed:', searchErr.message);
        }

        const matchedListingIds = matchedListingsDocs.map(l => l._id);
        const matchedListingsPayload = matchedListingsDocs.map(l => ({
            _id: l._id,
            title: l.title,
            city: l.city,
            listingType: l.listingType,
            price: l.price,
            rentalPeriod: l.rentalPeriod,
            image: l.image && l.image.length > 0 ? l.image[0].url : ''
        }));

        // Send listings to the sidebar now that we have them
        res.write(`data: ${JSON.stringify({ type: 'listings', matchedListings: matchedListingsPayload })}\n\n`);

        // ── Step 4: Final Advisor Response (LLM #2) ──
        const listingsContext = matchedListingsDocs.length > 0
            ? JSON.stringify(matchedListingsDocs.map(l => {
                const obj = (typeof l.toObject === 'function') ? l.toObject() : l;
                delete obj.listingVector; // Don't waste tokens on the math array
                return obj;
            }), null, 2)
            : 'NO CURRENT STOCK AVAILABLE';

        if (matchedListingsDocs.length > 0) {
            console.log('\n[AGENT DEBUG] Sending JSON Context to LLM #2. First item sample:');
            const firstItem = (typeof matchedListingsDocs[0].toObject === 'function') ? matchedListingsDocs[0].toObject() : matchedListingsDocs[0];
            const debugObj = { ...firstItem };
            delete debugObj.listingVector;
            console.log(JSON.stringify(debugObj, null, 2));
            console.log('-----------------------------------------------\n');
        }

        const dynamicSystemPrompt = `You are "Rentlyst Executive Lead" — a high-performing, bold, and expert marketplace manager. You move fast, speak with authority, and act as a professional closer for our clients.

**USER DOSSIER:**
User Name: ${userDisplayName || 'Valued Client'}
Identity/Preferences: ${userContextInfo}

**CURRENT MARKET DATA:**
Query: "${queryAnalysis.searchQuery}"
Inventory Status: ${searchWasRelaxed ? 'Relaxed Match (Inventory filtered to best available)' : 'Exact Match Found'}

LISTINGS (JSON format):
${listingsContext}

**THE PROFESSIONAL SELLER'S RULES:**
1. **JSON Intelligence**: Parse the JSON above for full details (Price, Specs, Review Summaries). Use it to be precise.
2. **Inventory Integrity**: Discuss ONLY the listings provided. Do not hallucinate items outside the stock list.
3. **Handle Scarcity**: If LISTINGS says 'NO CURRENT STOCK', do NOT invent items. Ask for more details to refine the search.
4. **The "Pitch" Style**: Be decisive and confident. Use phrases like "This is the ideal match" or "Move-fast deal."
5. **Information Protocol**: If user asks for their own details, check the User Dossier and answer accurately.
6. **Tone Discipline**: High-status, efficient, professional. Expert partner, not a service bot.

**RESPONSE STRUCTURE (Concise & Professional):**
- NO HEADINGS. NO BULLET POINTS (except for listing items).
- For each listing: "#N | Title, Price, Location — Market Verdict (one sentence expert opinion)."
- List items in EXACT sequential order from the data.
- Use past history to build trust where relevant.
- End with a directive closing statement.`;

        const finalMessages = [
            { role: 'system', content: dynamicSystemPrompt },
            ...chatHistory,
            { role: 'user', content: message }
        ];

        // Stream LLM #2 — full token budget for listing summaries
        const { stream: finalStream } = await callLLMStreamWithFallback(finalMessages, 2000);

        let fullResponse = '';
        for await (const chunk of finalStream) {
            const rawDelta = chunk.choices[0]?.delta;
            let delta = '';
            if (typeof rawDelta?.content === 'string') {
                delta = rawDelta.content;
            } else if (Array.isArray(rawDelta?.content)) {
                delta = rawDelta.content.filter(b => b.type === 'text').map(b => b.text || '').join('');
            }
            if (delta) {
                fullResponse += delta;
                res.write(`data: ${JSON.stringify({ type: 'token', content: delta })}\n\n`);
            }
        }

        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();

        console.log(`[Prime Agent Path B] LLM #2 response length: ${fullResponse.length} chars`);
        console.log(`[Agent Response] Preview: ${fullResponse.substring(0, 300)}${fullResponse.length > 300 ? '...' : ''}`);

        // Save LLM #2 response to DB (bridge text from LLM #1 is discarded — UX only)
        if (fullResponse.trim()) {
            conversation.messages.push({ role: 'user', content: message, matchedListings: [] });
            conversation.messages.push({ role: 'agent', content: fullResponse, matchedListings: matchedListingIds });
            await conversation.save();
            const unsummarizedCount = conversation.messages.length - (conversation.lastSummarizedIndex || 0);
            if (unsummarizedCount >= 3) {
                summarizeUnsummarizedChats(req.user._id).catch(e => console.error('[Summarizer Error]:', e));
            }
            console.log(`[Agent DB] Saved conversation ${conversation._id}`);
        }
    } catch (err) {
        console.error('Agent error:', err.message || err);

        // If headers not sent yet, send a proper JSON error
        if (!res.headersSent) {
            if (err.status === 429 || (err.message && err.message.includes('429'))) {
                return res.status(503).json({ error: 'AI is rate-limited. Please wait a moment and try again.' });
            }
            return res.status(500).json({ error: 'The agent encountered an error. Please try again.' });
        }

        // If we are already streaming, send an error event and close
        try {
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream interrupted. Please try again.' })}\n\n`);
            res.end();
        } catch (_) { }
    }
};

/**
 * [CONTROLLER 3]: getConversations
 * Retrieves the user's historical conversations for the sidebar.
 */
module.exports.getConversations = async (req, res) => {
    const conversations = await Conversation.find({ user: req.user._id })
        .sort({ updatedAt: -1 })
        .select('title updatedAt')
        .lean();

    res.json({ conversations });
};

/**
 * [CONTROLLER 4]: getConversation
 * Retrieves a single conversation's messages and linked listings.
 * Also triggers the summarizer to clean up memory when switching chats.
 */
module.exports.getConversation = async (req, res) => {
    try {
        const conversation = await Conversation.findOne({
            _id: req.params.id,
            user: req.user._id
        }).populate({
            path: 'messages.matchedListings',
            select: 'title city listingType price rentalPeriod image'
        }).lean();

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // TRIGGER ON SWITCH: When you move to this chat, we summarize any 
        // pending data from other chats to ensure the Dossier is fresh.
        summarizeUnsummarizedChats(req.user._id).catch(e =>
            console.error("[Summarizer Background Error]:", e.message || e)
        );

        // Map the most recent agent listings to the sidebar payload
        let matchedListings = [];
        for (let i = conversation.messages.length - 1; i >= 0; i--) {
            const msg = conversation.messages[i];
            if (msg.role === 'agent' && msg.matchedListings && msg.matchedListings.length > 0) {
                matchedListings = msg.matchedListings.map(l => ({
                    _id: l._id,
                    title: l.title,
                    city: l.city,
                    listingType: l.listingType,
                    price: l.price,
                    rentalPeriod: l.rentalPeriod,
                    image: l.image && l.image.length > 0 ? l.image[0].url : ''
                }));
                break;
            }
        }

        res.json({ conversation, matchedListings });
    } catch (err) {
        console.error('Error fetching conversation:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * [CONTROLLER 5]: deleteConversation
 * Deletes the specific AI conversation from the database.
 */
module.exports.deleteConversation = async (req, res) => {
    await Conversation.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ success: true });
};
