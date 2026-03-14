require('dotenv').config({ path: './.env' });

const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const ejsMate = require("ejs-mate");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const port = process.env.PORT || 8090;

// Models (load after connection is ready in practice, but safe here)
const Video = require("./models/Video");
const Blog = require("./models/Blog");
const Contact = require("./models/contact");
const DemoRequest = require("./models/DemoRequest");

// ────────────────────────────────────────────────
// MongoDB Connection with retry & caching (critical for Vercel)
// ────────────────────────────────────────────────
let isConnected = false;
let dbConnectionPromise = null;

const connectDB = async () => {
  if (isConnected) return;
  if (dbConnectionPromise) return dbConnectionPromise;

  dbConnectionPromise = mongoose
    .connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,           // good for serverless
      socketTimeoutMS: 45000,
    })
    .then(() => {
      console.log("MongoDB Connected Successfully");
      isConnected = true;
    })
    .catch((err) => {
      console.error("MongoDB Connection Error:", err);
      isConnected = false;
      dbConnectionPromise = null; // allow retry next time
      throw err;
    });

  return dbConnectionPromise;
};

// Call once at startup (Vercel will reuse if possible)
connectDB().catch((err) => console.error("Initial DB connection failed:", err));

// Middleware to ensure DB connection before DB routes
const ensureDBConnected = async (req, res, next) => {
  try {
    if (!isConnected) {
      await connectDB();
    }
    next();
  } catch (err) {
    console.error("DB connection failed in middleware:", err);
    res.status(503).json({ error: "Database connection unavailable. Please try again later." });
    // or for HTML routes: res.status(503).render("error", { message: "Service temporarily unavailable" });
  }
};

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer Storages
const videoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "portfolio-videos",
    resource_type: "video",
  },
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 4.5 * 1024 * 1024 }, // 4.5MB limit for Vercel
});

const blogStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "blog-images",
    allowed_formats: ["jpg", "jpeg", "png", "gif"],
    transformation: [{ width: 1200, crop: "limit" }],
  },
});
const uploadBlogImage = multer({
  storage: blogStorage,
  limits: { fileSize: 4.5 * 1024 * 1024 } // 4.5MB limit for Vercel
});

// App Setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Trust the first proxy (Render, Railway, Heroku, Nginx etc. all sit in front)
// Without this, req.secure is always false and secure cookies never transmit back.
app.set("trust proxy", 1);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // HTTPS-only in prod
      sameSite: "lax",   // needed for redirect flows
      httpOnly: true,     // prevent JS access to session cookie
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

// Admin Middleware
const requireAdmin = (req, res, next) => {
  if (req.session.isAdmin) return next();
  res.redirect("/adminlogin");
};

// ==================== PUBLIC ROUTES (no DB needed) ====================
app.get("/", (req, res) => res.render("home"));
app.get("/about", (req, res) => res.render("about"));
app.get("/services", (req, res) => res.render("services"));

app.get("/ethnic-fashion-Shoots", (req, res) => res.render("service1"));
app.get("/western-indo-western-shoot", (req, res) => res.render("service2"));
app.get("/designer-collections-shoot", (req, res) => res.render("service3"));
app.get("/retail-catalogue-shoot", (req, res) => res.render("service4"));
app.get("/brand-campaigns-editorials-shoot", (req, res) => res.render("service5"));
app.get("/post-production-shoot", (req, res) => res.render("service6"));

app.get("/Terms&Conditions", (req, res) => res.render("terms"));
app.get("/PrivacyPolicy", (req, res) => res.render("PP"));

app.get("/premium-shoot", (req, res) => res.render("landingpage"));
app.get("/contact", (req, res) => res.render("contact"));

// ==================== DB-RELATED PUBLIC ROUTES ====================
app.get("/ourwork", ensureDBConnected, async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    res.render("ourwork", { videos });
  } catch (err) {
    console.error("Error fetching videos:", err);
    res.render("ourwork", { videos: [] });
  }
});

app.get("/blogs", ensureDBConnected, async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.render("blogs", { blogs });
  } catch (err) {
    console.error("Error fetching blogs:", err);
    res.render("blogs", { blogs: [] });
  }
});

app.get("/blog/:id", ensureDBConnected, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).render("404", { message: "Blog not found" });
    res.render("blog-details", { blog });
  } catch (err) {
    console.error("Blog details error:", err);
    res.status(500).render("404", { message: "Server error" });
  }
});

// Contact Form
app.post("/contact", ensureDBConnected, async (req, res) => {
  try {
    let {
      contactId, // New hidden field
      name,
      email,
      phone,
      subject,
      website,
      message,
      budget,
      membership,
      location,
    } = req.body;

    name = name?.trim();
    email = email?.trim()?.toLowerCase();
    phone = phone?.trim();
    subject = subject?.trim();
    website = website?.trim() || null;
    message = message?.trim();
    membership = membership?.trim() || null;
    const finalBudget = budget?.trim() || null;

    if (!name || !email || !phone || !subject || !message) {
      console.log("Missing required fields");
      return res.redirect("/#contact");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[6-9]\d{9}$/;

    if (!emailRegex.test(email)) {
      console.log("Invalid email:", email);
      return res.redirect("/#contact");
    }

    if (!phoneRegex.test(phone)) {
      console.log("Invalid phone:", phone);
      return res.redirect("/#contact");
    }

    if (contactId) {
      // Update existing partial contact
      await Contact.findByIdAndUpdate(contactId, {
        name,
        email,
        phone,
        subject,
        website,
        message,
        budget: finalBudget,
        membership,
        location,
        isPartial: false // Mark as complete
      });
      console.log("Updated contact:", { name, email, contactId });
    } else {
      // Create new contact
      await Contact.create({
        name,
        email,
        phone,
        subject,
        website,
        message,
        budget: finalBudget,
        membership,
        location,
        isPartial: false
      });
      console.log("New contact saved:", { name, email, budget: finalBudget });
    }

    // Your beautiful thank-you HTML (unchanged)
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Thank You - Golden Apple Productions</title>

<!-- Font Awesome CDN for WhatsApp -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"/>

</head>
<body style="margin:0;padding:0;height:100vh;background:#000;color:#caa437;font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif;display:flex;align-items:center;justify-content:center;overflow:hidden">

  <!-- Floating WhatsApp & Call Buttons -->
  <div style="position:fixed; bottom:30px; right:30px; display:flex; flex-direction:column; gap:15px; z-index:1000;">
    
    <a target="_blank" href="https://wa.me/917300031017" aria-label="WhatsApp Chat" style="
    color:white;   width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center;
      background:#22ae06; color:#000; box-shadow:0 6px 20px rgba(0,0,0,0.4); text-decoration:none;
      transition:all 0.3s ease; font-size:30px;"
      onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 28px rgba(0,0,0,0.45)'"
      onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 6px 20px rgba(0,0,0,0.4)'">
      <i class="fa-brands fa-whatsapp"></i>
    </a>

    <a target="_blank" href="tel:+917300031017" aria-label="Call Now" style="
      width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center;
      background:#caa437; color:#000; box-shadow:0 6px 20px rgba(0,0,0,0.4); transition:all 0.3s ease; text-decoration:none;">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:28px; height:28px;">
        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
      </svg>
    </a>
  </div>

<div id="particles" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none"></div>

<div style="text-align:center;padding:40px;position:relative;">
  <svg viewBox="0 0 1000 300" style="width:90%;max-width:900px;margin-bottom:40px;">
    <defs>
      <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#f0d48a"/>
        <stop offset="50%" stop-color="#caa437"/>
        <stop offset="100%" stop-color="#f0d48a"/>
      </linearGradient>
    </defs>
    <text x="500" y="180" font-family="Brush Script MT,cursive" font-size="140" fill="url(#goldGradient)" text-anchor="middle" style="filter:drop-shadow(0 0 20px rgba(202,164,55,0.6));">
      Thank You
    </text>
  </svg>

  <h2 style="font-size:1.8rem;margin:30px 0;color:#caa437;">
    Your message has been sent successfully!
  </h2>

  <p style="font-size:1.3rem;max-width:700px;margin:0 auto 40px;opacity:0.85;line-height:1.6;">
    We truly appreciate you reaching out to Golden Apple Productions.<br>
    Our team will review your Enquiry and get back to you as soon as possible.
  </p>

  <a href="/" style="display:inline-block;background:#caa437;color:#000;font-weight:bold;padding:14px 32px;border-radius:50px;text-decoration:none;font-size:1.1rem;margin-bottom:40px;transition:all 0.3s ease;"
     onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 10px 30px rgba(202,164,55,0.4)'"
     onmouseout="this.style.transform='none';this.style.boxShadow='none'">
     ← Back to Home
  </a>

  <div style="margin-top:30px;">
    <a href="https://www.instagram.com/golden.apple.productions/" target="_blank"
       style="display:flex;align-items:center;justify-content:center;gap:14px;color:#caa437;text-decoration:none;font-size:1.4rem;transition:all 0.3s ease;"
       onmouseover="this.style.color='#f0d48a';this.style.transform='translateY(-3px)'"
       onmouseout="this.style.color='#caa437';this.style.transform='none'">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
        <circle cx="12" cy="12" r="4"></circle>
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
      </svg>
      <span>golden.apple.productions</span>
    </a>
  </div>
</div>

<script>
const particles=document.getElementById('particles');
function createParticle(){
  const p=document.createElement('div');
  p.style.position='absolute';
  p.style.width=Math.random()*6+4+'px';
  p.style.height=p.style.width;
  p.style.background='#caa437';
  p.style.borderRadius='50%';
  p.style.left=Math.random()*100+'vw';
  p.style.top='100vh';
  p.style.opacity='0.8';
  p.style.transition='transform 4s ease-out, opacity 4s';
  particles.appendChild(p);
  setTimeout(()=>{p.style.transform='translateY(-110vh)';p.style.opacity='0'},50);
  setTimeout(()=>p.remove(),5000);
}
setInterval(createParticle,300);
</script>

</body>
</html>`);

  } catch (err) {
    console.error("CONTACT FORM ERROR:", err);
    return res.redirect("/#contact");
  }
});

// Partial Submission Route
app.post("/contact/partial", ensureDBConnected, async (req, res) => {
  try {
    let { contactId, name, email, phone, subject } = req.body;

    // Basic validation for Step 1
    if (!name || !email || !phone || !subject) {
      return res.status(400).json({ error: "Missing required fields for partial submission" });
    }

    if (contactId) {
      await Contact.findByIdAndUpdate(contactId, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        subject: subject.trim(),
        isPartial: true // Still partial
      });
      return res.json({ success: true, id: contactId });
    }

    const newContact = await Contact.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      subject: subject.trim(),
      isPartial: true
    });

    res.json({ success: true, id: newContact._id });
  } catch (err) {
    console.error("Partial submission error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Book Demo
app.post("/book-demo", ensureDBConnected, async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
      return res.status(400).json({ error: "Invalid mobile number" });
    }

    // const existing = await DemoRequest.findOne({ mobile });
    // if (existing) {
    //   return res.json({ message: "This number is already registered!" });
    // }

    const newRequest = new DemoRequest({ mobile });
    await newRequest.save();

    res.json({ success: true, message: "Thank you! We will contact you soon." });
  } catch (err) {
    console.error("Demo request error:", err);
    res.status(500).json({ error: "Server error - please try again" });
  }
});

// ==================== ADMIN ROUTES ====================
app.get("/adminlogin", (req, res) => {
  if (req.session.isAdmin) return res.redirect("/admin/dashboard");
  res.render("admin/adminlogin", { error: null });
});

app.post("/adminlogin", (req, res) => {
  const { username, password } = req.body;
  if (username === "a" && password === "a") {
    req.session.isAdmin = true;
    return res.redirect("/admin/dashboard");
  }
  res.render("admin/adminlogin", { error: "Invalid username or password" });
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/adminlogin");
});

app.get("/admin/dashboard", requireAdmin, ensureDBConnected, async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    const blogs = await Blog.find().sort({ createdAt: -1 });
    const contacts = await Contact.find().sort({ createdAt: -1 });
    const demoRequests = await DemoRequest.find().sort({ createdAt: -1 });

    res.render("admin/dashboard", {
      videos,
      blogs,
      contacts,
      demoRequests,
      reelsCount: videos.filter((v) => v.type === "reel").length,
      blogsCount: blogs.length, // fixed typo
    });
  } catch (err) {
    console.error("Dashboard load error:", err);
    res.render("admin/dashboard", {
      videos: [],
      blogs: [],
      contacts: [],
      demoRequests: [],
      reelsCount: 0,
      blogsCount: 0,
    });
  }
});

// Video Management
app.get("/admin/videos/add/:type", requireAdmin, (req, res) => {
  const type = req.params.type;
  if (!["video", "reel"].includes(type)) return res.redirect("/admin/dashboard");
  res.render("admin/videos/add", { type, error: null });
});

app.post(
  "/admin/videos/add/:type",
  requireAdmin,
  videoUpload.single("video"),
  async (req, res) => {
    try {
      if (!req.file) throw new Error("No video file selected.");

      const { title, description } = req.body;
      const type = req.params.type;

      const newItem = new Video({
        title: title?.trim() || "Untitled",
        description: description?.trim() || "",
        videoUrl: req.file.path,
        publicId: req.file.filename,
        type,
      });

      await newItem.save();
      res.redirect("/admin/dashboard");
    } catch (err) {
      console.error("Video upload error:", err);
      res.render("admin/videos/add", {
        error: err.message,
        type: req.params.type,
      });
    }
  }
);

app.get("/admin/videos/delete/:id", requireAdmin, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (video) {
      await cloudinary.uploader.destroy(video.publicId, { resource_type: "video" });
      await Video.findByIdAndDelete(req.params.id);
    }
  } catch (err) {
    console.error("Video delete error:", err);
  }
  res.redirect("/admin/dashboard");
});

// Blog Management (unchanged except added ensureDBConnected where needed)
app.get("/admin/blogs/add", requireAdmin, (req, res) => {
  res.render("admin/blogs/add", { error: null });
});

app.post(
  "/admin/blogs/add",
  requireAdmin,
  uploadBlogImage.single("image"),
  async (req, res) => {
    try {
      const { title, paragraph1, paragraph2, quote } = req.body;

      if (!title || !paragraph1 || !paragraph2) {
        throw new Error("Title, Paragraph 1, and Paragraph 2 are required.");
      }

      const newBlog = new Blog({
        title: title.trim(),
        paragraph1: paragraph1.trim(),
        paragraph2: paragraph2.trim(),
        quote: quote?.trim() || "",
        imageUrl: req.file ? req.file.path : null,
      });

      await newBlog.save();
      res.redirect("/admin/dashboard");
    } catch (err) {
      console.error("Blog add error:", err);
      res.render("admin/blogs/add", { error: err.message });
    }
  }
);

// Edit / Delete Blog (similar - add ensureDBConnected if needed)
app.get("/admin/blogs/edit/:id", requireAdmin, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.redirect("/admin/dashboard");
    res.render("admin/blogs/edit", { blog, error: null });
  } catch (err) {
    console.error(err);
    res.redirect("/admin/dashboard");
  }
});

app.post(
  "/admin/blogs/edit/:id",
  requireAdmin,
  uploadBlogImage.single("image"),
  async (req, res) => {
    try {
      const { title, paragraph1, paragraph2, quote } = req.body;

      if (!title || !paragraph1 || !paragraph2) {
        throw new Error("Required fields missing.");
      }

      const updateData = {
        title: title.trim(),
        paragraph1: paragraph1.trim(),
        paragraph2: paragraph2.trim(),
        quote: quote?.trim() || "",
      };

      if (req.file) {
        updateData.imageUrl = req.file.path;
      }

      await Blog.findByIdAndUpdate(req.params.id, updateData);
      res.redirect("/admin/dashboard");
    } catch (err) {
      console.error(err);
      const blog = await Blog.findById(req.params.id);
      res.render("admin/blogs/edit", { blog, error: err.message });
    }
  }
);

app.get("/admin/blogs/delete/:id", requireAdmin, async (req, res) => {
  try {
    await Blog.findByIdAndDelete(req.params.id);
  } catch (err) {
    console.error("Blog delete error:", err);
  }
  res.redirect("/admin/dashboard");
});

// Contact Delete (single route - removed duplicate)
app.get("/admin/contacts/delete/:id", requireAdmin, async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
  } catch (err) {
    console.error("Contact delete error:", err);
  }
  res.redirect("/admin/dashboard");
});

// Start Server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});