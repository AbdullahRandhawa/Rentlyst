# 🏠 Rentlyst – AI-Powered Listing Platform For Renting & Selling


Rentlyst is a marketplace application. The project demonstrates building a complete data pipeline for semantic search and retrieval-augmented generation. Designed end-to-end workflows for data ingestion, cleaning, transformation, and embedding generation to power intelligent document retrieval. Implemented vector-based similarity matching using cosine distance and LLM-driven data preprocessing to surface relevant results through natural language queries. This platform empowers users to buy, sell, and rent diverse goods and services through an intelligent, category-driven interface powered by cutting-edge AI technologies.


---

## 🎯 Core Features

### 1. **Dynamic Marketplace with Smart Search**
- Browse and discover listings across multiple categories (Electronics, Real Estate, Vehicles, Services, etc.)
- Advanced search functionality using regex-based pattern matching across title, location, category, and subcategory
- Semantic search context built into every listing for intelligent discovery
- Filter listings by location (city/country), rental period (hour/day/week/month), and condition grade

### 2. **Intelligent AI-Powered Listings**
- **Automated Description Cleaning**: AI processes raw descriptions to extract only hard facts, removing sales bias and fluff using LLM-based extraction
- **Vector Embeddings**: Every listing is automatically converted into a high-dimensional vector using state-of-the-art embedding models
- **Semantic Search Context**: Machine learning-generated searchContext combines listing attributes with cleaned descriptions for enhanced discoverability
- **AI Review Intelligence**: AI analyzes and summarizes user reviews to help buyers make informed decisions

### 3. **Comprehensive User Authentication & Security**
- **Firebase Authentication Integration**: Secure email/password authentication with Firebase Admin SDK
- **Session Management**: MongoDB-backed session storage with configurable expiration (60 days)
- **Global Firebase Session Verification**: Every request validates Firebase session cookies at the middleware level
- **Role-Based Access Control (RBAC)**: Three distinct roles (User, Admin) with appropriate permission gates
- **Account Security Features**: Admin-controlled user disabling and listing creation restrictions

### 4. **Rich User Profiles**
- Custom user profiles with profile pictures hosted on Cloudinary
- Display user verification status and experience metrics
- Profile integration across the marketplace (linked to listings and reviews)
- Visual profile previews in listing details and review sections

### 5. **Geographic & Mapping Infrastructure**
- **Mapbox Integration**: Real-time geocoding to convert addresses into precise coordinates
- **GeoJSON Support**: Listings store geometry data as GeoJSON Point objects for spatial queries
- **Location-Based Features**: Full address, city, and country tracking for every listing
- **Interactive Map Display**: Frontend integration for location visualization

### 6. **Review & Rating System**
- 5-star rating system with detailed comment support
- Author tracking with automatic timestamps
- Database cascading: Reviews are automatically deleted when parent listings are removed
- Reviewer profile display with avatar images in listing detail pages
- AI-generated review summaries for quick buyer insights

### 7. **Image Upload & Management**
- **Cloudinary Integration**: Images stored on CDN with optimized delivery
- **Multi-Image Support**: Upload multiple images per listing with automatic URL generation
- **Thumbnail Generation**: Dynamic image optimization for thumbnails (150px width)
- **Automatic Cleanup**: Images deleted from Cloudinary when listings are removed
- **Supported Formats**: PNG, JPG, JPEG with automatic validation

### 8. **Comprehensive Admin Dashboard**
- Admin-exclusive access to platform management tools
- User management capabilities (enable/disable accounts, restrict listing creation)
- Listing moderation and removal
- User analytics and statistics
- Middleware protection with isAdmin role verification

### 9. **Multi-Category Marketplace Structure**
Rentlyst supports diverse marketplace categories:
- **Electronics**: Phones, Laptops, Cameras, Gaming Consoles
- **Real Estate**: Apartments, Houses, Commercial Spaces
- **Vehicles**: Cars, Motorcycles, Bicycles, Scooters
- **Services**: Tutoring, Photography, Design, Consulting, Repairs
- **Furniture & Home**: Sofas, Beds, Desks, Decorations
- **Equipment & Tools**: Power Tools, Cameras, Sports Equipment
- **Fashion**: Clothing, Shoes, Accessories

Each category supports relevant subcategories with dynamic specifications validation.

### 10. **Flexible Listing Types**
- **Sale Listings**: One-time purchase transactions
- **Rental Listings**: Flexible rental periods (hourly, daily, weekly, monthly)
- **Service Listings**: Time-based or project-based services with online/on-site options
- **Condition Grading**: 1-10 scale for product condition assessment

### 11. **Real-Time Notifications & Messages**
- Global flash message system for success/error alerts
- Session-based message queuing via connect-flash
- User feedback on all operations (create, edit, delete, review submissions)

---

## 🛠 Technology Stack

### **Backend Framework**
- **Node.js 22.x**: Latest LTS runtime environment with modern JavaScript features
- **Express.js 5.1.0**: Fast, unopinionated web framework for building RESTful APIs
- **EJS 3.1.10**: Embedded JavaScript templating with ejs-mate layout support
- **EJS-Mate 4.0.0**: Advanced templating with layout inheritance

### **Database & Data Management**
- **MongoDB**: NoSQL database for flexible schema and scalability
- **Mongoose 8.17.1**: ODM (Object Document Mapper) for MongoDB with schema validation
- **MongoDB Session Store (connect-mongo 5.1.0)**: Persistent session management

### **AI & Machine Learning Integration**
- **OpenAI API 6.32.0**: GPT models for description cleaning and intelligent processing
- **Google GenAI 1.45.0**: Advanced AI capabilities for embedding and analysis
- **Vector Embeddings**: Semantic search through high-dimensional vector representations
- **Cosine Similarity**: Mathematical algorithm for relevance scoring in semantic search

### **Authentication & Security**
- **Firebase Admin SDK 13.6.1**: Enterprise-grade authentication and session management
- **Express-Session 1.18.2**: Server-side session middleware
- **Cookie-Parser 1.4.7**: Cookie parsing and management
- **Method-Override 3.0.0**: HTTP method override for PUT/DELETE operations (browser compatibility)

### **File & Image Management**
- **Cloudinary 1.37.2**: Cloud-based image hosting, optimization, and CDN delivery
- **Multer 2.0.2**: Multipart form data handling for file uploads
- **Multer-Storage-Cloudinary 4.0.0**: Direct Cloudinary integration for Multer

### **Geolocation & Mapping**
- **Mapbox SDK 0.16.2**: Geocoding API for coordinate conversion and location services

### **Input Validation & Security**
- **Joi 18.0.1**: Schema validation library for request body validation
- **Express-Rate-Limit 8.3.1**: Rate limiting middleware to prevent abuse
- **Environment Variables (dotenv 17.2.2)**: Secure configuration management

### **Frontend Styling**
- **Bootstrap 5.3.7**: Responsive CSS framework (46.4% of codebase)
- **Custom CSS 19.9%**: Additional styling for marketplace-specific components

### **Infrastructure & Deployment**
- **Docker**: Multi-stage containerization for production deployment
- **Non-root User Container**: Security best practices with dedicated rentlyst user
- **Health Checks**: Docker health monitoring with HTTP endpoint verification
- **Node Alpine Images**: Lightweight base images (node:22-alpine) for minimal footprint

### **Development & Quality**
- **Node Package Manager**: npm with detailed package-lock.json dependency tree

---

## 📊 Project Statistics

| Metric | Value |
|--------|-------|
| **Primary Language** | EJS (46.4%) |
| **Backend Logic** | JavaScript (33.4%) |
| **Styling** | CSS (19.9%) |
| **Infrastructure** | Dockerfile (0.3%) |
| **Total Size** | 716 KB |
| **Repository** | Public (Open Source) |
| **Node Version** | 22.x |

---

## 🏗 Architecture Overview

### **Model-View-Controller (MVC) Pattern**
```
├── models/
│   ├── listing.js       (Core marketplace listing schema with GeoJSON)
│   ├── user.js          (Firebase-integrated user schema with RBAC)
│   ├── review.js        (Review schema with 1:N relationship to listings)
│   ├── profile.js       (User profile schema with avatar storage)
│   └── conversation.js  (Messaging system schema)
│
├── controllers/
│   ├── explore.js       (Listing CRUD, AI processing, vector generation)
│   ├── reviews.js       (Review creation, deletion, AI summarization)
│   ├── users.js         (Authentication, user management, Firebase integration)
│   ├── profiles.js      (Profile CRUD, avatar management)
│   ├── agent.js         (AI agent orchestration - 37KB of intelligence)
│   ├── home.js          (Homepage and static content)
│   └── admin.js         (Admin dashboard operations)
│
├── routes/
│   ├── explore.js       (GET/POST/PATCH/DELETE listing endpoints)
│   ├── review.js        (POST/DELETE review endpoints)
│   ├── user.js          (Authentication routes)
│   ├── profile.js       (Profile management routes)
│   ├── agent.js         (AI agent endpoints)
│   ├── admin.js         (Admin-only routes)
│   └── home.js          (Static routes)
│
├── views/
│   ├── layouts/         (Master layout templates)
│   ├── includes/        (Reusable component partials)
│   ├── explore/         (Listing pages: index, show, edit, new, search)
│   ├── users/           (Auth pages: login, register)
│   ├── admin/           (Admin dashboard pages)
│   ├── agent/           (AI agent interface)
│   └── legal/           (Terms, Privacy policies)
│
├── config/
│   ├── cloudConfig.js   (Cloudinary API configuration)
│   └── firebase-service-account.json (Firebase credentials)
│
├── utils/
│   ├── middleware.js    (Auth, authorization, validation)
│   ├── embedding.js     (Vector embedding generation + cosine similarity)
│   ├── categories.js    (Master category definitions)
│   ├── asyncWrap.js     (Async error handling wrapper)
│   ├── ExpressError.js  (Custom error class)
│   └── openai.js        (OpenAI API client)
│
└── public/
    ├── stylesheets/     (Custom CSS)
    └── scripts/         (Client-side JavaScript)
```

### **Data Flow Diagram**

```
User Request
    ↓
Express Middleware (Firebase Session Verification)
    ↓
Route Handler
    ↓
Controller Logic
    ├─→ Database Query (Mongoose)
    ├─→ AI Processing (OpenAI/Google GenAI)
    ├─→ File Upload (Multer → Cloudinary)
    └─→ Geocoding (Mapbox)
    ↓
View Rendering (EJS Template)
    ↓
Response
```

---

## 🚀 Key Technical Implementations

### **Advanced Search & Discovery**
The explore controller implements a sophisticated search algorithm:
1. **Regex-based Text Search**: Case-insensitive pattern matching across 7 fields
2. **Owner Username Matching**: Find listings by user identity
3. **Semantic Context Search**: AI-generated searchContext field enables meaningful results
4. **Category Filtering**: Dynamic subcategory validation based on main category

**Code Example**:
```javascript
const allListings = await Listing.find({
    $or: [
        { title: { $regex: searchQuery } },
        { city: { $regex: searchQuery } },
        { country: { $regex: searchQuery } },
        { mainCategory: { $regex: searchQuery } },
        { subCategory: { $regex: searchQuery } },
        { searchContext: { $regex: searchQuery } },
        { owner: { $in: ownerIds } }
    ]
}).sort({ _id: -1 });
```

### **AI-Driven Description Enhancement**
Listings are automatically processed through an LLM pipeline:
1. **Raw Description Input**: User provides listing description
2. **LLM Cleaning**: AI extracts hard facts, removes fluff (using OpenRouter fallback models)
3. **Context Building**: Combined with listing metadata (category, specs, location)
4. **Vector Embedding**: Complete context converted to 1536-dimensional vector
5. **Storage**: Vector saved in database for semantic similarity searches

**Supporting Functions**:
- `getCleanedDescription()`: LLM-powered description sanitization
- `buildSearchContext()`: Concatenates all relevant attributes
- `generateEmbedding()`: Creates vector representation via OpenAI embeddings

### **Vector-Based Semantic Search**
Embeddings enable similarity-based discovery:
- **Input Type Differentiation**: 'passage' for indexing, 'query' for searches
- **Cosine Similarity Algorithm**: Computes angle between vectors for relevance scoring
- **Range**: [-1, 1] where 1 = perfect match, 0 = no similarity

```javascript
function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

### **Firebase Authentication Flow**
Modern Firebase integration replacing traditional passport-local:
1. **Client-Side**: Firebase SDK handles login/signup
2. **Session Cookie**: Firebase creates __session cookie with JWT
3. **Global Middleware**: Every request verifies cookie
4. **MongoDB Sync**: Firebase UID linked to MongoDB User record
5. **Graceful Fallback**: Invalid cookies silently handled on public routes

**Global Middleware** (app.js):
```javascript
app.use(async (req, res, next) => {
    const sessionCookie = req.cookies.__session || '';
    req.user = null;
    
    if (sessionCookie) {
        try {
            const decodedClaims = await admin.auth().verifySessionCookie(sessionCookie, true);
            const user = await User.findOne({ firebaseUid: decodedClaims.uid });
            if (user) req.user = user;
        } catch (err) {
            // Silently ignore invalid cookies
        }
    }
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.currUser = req.user;
    next();
});
```

### **GeoJSON Geospatial Data**
Listings store precise geographic information:
```javascript
geometry: {
    type: {
        type: String,
        enum: ['Point'],
        required: true
    },
    coordinates: {
        type: [Number],  // [longitude, latitude]
        required: true
    }
}
```
This structure enables future spatial queries (radius searches, geographic clustering).

### **Cascading Delete Operations**
Mongoose post-hooks ensure data integrity:
```javascript
listingSchema.post('findOneAndDelete', async (listing) => {
    if (listing) {
        // Delete associated reviews
        await Review.deleteMany({ _id: { $in: listing.reviews } });
        // Delete images from Cloudinary
        if (listing.image && listing.image.length > 0) {
            for (let image of listing.image) {
                if (image.filename) {
                    await cloudinary.uploader.destroy(image.filename);
                }
            }
        }
    }
});
```

### **Joi Schema Validation**
Comprehensive server-side validation prevents malformed data:
- **Dynamic Specifications**: Conditional fields based on category
- **Enum Constraints**: Valid values for rental periods, listing types, service locations
- **Range Validation**: Condition grades 1-10, ratings 1-5
- **Type Safety**: Ensures correct data types before database insertion

---

## 🔐 Security Features

1. **Environment Variable Protection**: Sensitive credentials via .env files
2. **Rate Limiting**: Express-rate-limit prevents brute force attacks
3. **CSRF Protection**: Method-override with HTTP verb safety
4. **Session Security**: httpOnly cookies, 60-day expiration, MongoDB storage
5. **Firebase Admin Verification**: Server-side session cookie validation
6. **Role-Based Authorization**: isAdmin, isLoggedIn, isOwner middleware gates
7. **Input Validation**: Joi schemas prevent injection attacks
8. **Non-Root Docker User**: Container runs as 'rentlyst' user (not root)
9. **Cloudinary API Keys**: Scoped credentials in environment config

---

## 📦 Deployment & Scalability

### **Docker Multi-Stage Build**
```dockerfile
Stage 1 (Builder):
- Node 22 Alpine image
- Install dependencies with npm ci --omit=dev
- Copy source files

Stage 2 (Runtime):
- Lean Alpine-based production image
- Copy only production dependencies
- Non-root user for security
- Health checks enabled
- Ports: 10000 (configurable via PORT env var)
```

### **Environment Configuration**
Production-ready variables:
- `NODE_ENV`: 'production' or 'development'
- `ATLASDB_URL`: MongoDB Atlas connection string
- `FIREBASE_SERVICE_ACCOUNT`: JSON credentials (or file path)
- `MAP_TOKEN`: Mapbox API token
- `CLOUD_NAME/CLOUD_API_KEY/CLOUD_API_SECRET`: Cloudinary credentials
- `OPENROUTER_FALLBACK_MODELS`: AI model selection
- `OPENROUTER_EMBED_MODEL`: Embedding model specification
- `SECRET`: Session encryption key
- `PORT`: Server listen port (default: 10000)

---

## 🎓 Skills Demonstrated

### **Backend Development**
✓ Express.js REST API design  
✓ MongoDB/Mongoose database modeling  
✓ Async/await error handling  
✓ Middleware orchestration  
✓ Authentication & authorization patterns  
✓ File upload handling  

### **AI/ML Integration**
✓ Vector embeddings & semantic search  
✓ Cosine similarity computation  
✓ LLM API integration (OpenAI, Google GenAI)  
✓ AI-driven content processing  
✓ Prompt engineering for description cleaning  

### **Frontend Development**
✓ EJS templating with layouts  
✓ Bootstrap responsive design  
✓ CSS styling & customization  
✓ Client-side validation  
✓ Dynamic form handling  

### **DevOps & Infrastructure**
✓ Docker containerization  
✓ Multi-stage builds  
✓ Environment configuration  
✓ Health checks & monitoring  
✓ Cloud deployment strategies  

### **Third-Party Integration**
✓ Firebase Authentication  
✓ Cloudinary CDN  
✓ Mapbox Geocoding  
✓ OpenAI API  
✓ Google Cloud AI  

### **Software Engineering Practices**
✓ MVC architecture  
✓ Separation of concerns  
✓ DRY (Don't Repeat Yourself)  
✓ Error handling & validation  
✓ Schema validation  
✓ Comprehensive documentation  

---

## 📚 Learning Outcomes

This project showcases comprehensive full-stack development capabilities:

1. **Complex Database Design**: Multi-model schemas with references, embedding, and geospatial data
2. **API Security**: Firebase integration, session management, role-based access control
3. **AI/ML Pipeline**: From raw input → cleaning → embedding → semantic search
4. **Cloud Services**: Integration with Cloudinary, Firebase, Mapbox, OpenAI
5. **Scalable Architecture**: Docker containerization for cloud deployment
6. **User Experience**: Dynamic forms, validation, real-time feedback, responsive design
7. **Production Readiness**: Error handling, logging, health checks, env configuration

---

## 🚀 Getting Started

### Prerequisites
- Node.js 22.x
- MongoDB Atlas account
- Firebase project with Admin SDK
- Cloudinary account
- Mapbox API token
- OpenAI/OpenRouter API key

### Installation
```bash
# Clone repository
git clone https://github.com/AbdullahRandhawa/Rentlyst.git
cd Rentlyst

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your credentials

# Start server
npm start
```

### Docker Deployment
```bash
docker build -t rentlyst:latest .
docker run -p 10000:10000 \
  -e ATLASDB_URL=mongodb+srv://... \
  -e FIREBASE_SERVICE_ACCOUNT='...' \
  rentlyst:latest
```

---

## 📝 License

ISC

---

## 👤 Author

**Abdullah Randhawa**  
GitHub: [@AbdullahRandhawa](https://github.com/AbdullahRandhawa)  
Project Repository: [AbdullahRandhawa/Rentlyst](https://github.com/AbdullahRandhawa/Rentlyst)

---

## 🙏 Acknowledgments

This Final Year Project demonstrates integration of modern web technologies, cloud services, and AI capabilities to build a production-ready marketplace platform. Special thanks to the open-source community and cloud service providers that made this comprehensive stack possible.

---

**Built with ❤️ as a Final Year Project**
```
