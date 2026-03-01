// ================= IMPORTS =================
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");

const TryOn = require("./models/TryOn");
const Post = require("./models/Post");
const Comment = require("./models/Comment");
const User = require("./models/User");

const app = express();
app.use(express.json());
app.use(cors());

// ================= SERVER CONFIG =================
const SERVER_IP = "10.102.140.49"; // change if needed
const PORT = 5000;

// ================= MONGODB =================
mongoose
  .connect("mongodb://127.0.0.1:27017/virtualtryon")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// ================= MULTER =================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({ storage });
app.use("/uploads", express.static("uploads"));

/* =========================================================
   AUTH SECTION
========================================================= */

// SIGNUP
app.post("/signup", async (req, res) => {
  try {
    const { username, firstName, lastName, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      firstName,
      lastName,
      email,
      password: hashedPassword,
    });

    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// LOGIN

// LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(400).json({ message: "Invalid credentials" });

    // ✅ IMPORTANT FIX
    res.json({ user });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// app.post("/login", async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     const user = await User.findOne({ email });
//     if (!user)
//       return res.status(400).json({ message: "Invalid credentials" });

//     const valid = await bcrypt.compare(password, user.password);
//     if (!valid)
//       return res.status(400).json({ message: "Invalid credentials" });

//     res.json(user);
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

/* =========================================================
   PROFILE UPDATE (USERNAME, PASSWORD, IMAGE)
========================================================= */

app.put("/update-profile/:id", upload.single("profileImage"), async (req, res) => {
  try {
    const { username, password } = req.body;

    const updateData = {};

    if (username) updateData.username = username;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }

    if (req.file) {
      updateData.profileImage = `http://${SERVER_IP}:${PORT}/uploads/${req.file.filename}`;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json(updatedUser);
  } catch {
    res.status(500).json({ message: "Profile update failed" });
  }
});

// GET USER
app.get("/user/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate("followers", "username profileImage")
      .populate("following", "username profileImage");

    res.json(user);
  } catch {
    res.status(500).json({ message: "Error fetching user" });
  }
});

/* =========================================================
   POSTS SECTION
========================================================= */

// CREATE POST
app.post("/create-post", upload.single("image"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "Image required" });

    const imageUrl = `http://${SERVER_IP}:${PORT}/uploads/${req.file.filename}`;

    const newPost = await Post.create({
      user: req.body.userId,
      image: imageUrl,
      caption: req.body.caption,
    });

    const populatedPost = await newPost.populate(
      "user",
      "username profileImage followers following"
    );

    res.status(201).json(populatedPost);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

// GET POSTS WITH COMMENT COUNT
app.get("/get-posts", async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("user", "username profileImage followers")
      .sort({ createdAt: -1 });

    const postsWithCounts = await Promise.all(
      posts.map(async (post) => {
        const commentCount = await Comment.countDocuments({
          post: post._id,
        });

        return {
          ...post._doc,
          commentCount,
        };
      })
    );

    res.json(postsWithCounts);
  } catch (error) {
    res.status(500).json({ message: "Error fetching posts" });
  }
});

// LIKE / UNLIKE
app.put("/like-post/:postId", async (req, res) => {
  try {
    const { userId } = req.body;
    const post = await Post.findById(req.params.postId);

    const alreadyLiked = post.likes.includes(userId);

    if (alreadyLiked)
      post.likes.pull(userId);
    else
      post.likes.push(userId);

    await post.save();

    res.json(post);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================================================
   FOLLOW SYSTEM
========================================================= */

app.put("/follow/:id", async (req, res) => {
  try {
    const { userId } = req.body;
    const followUserId = req.params.id;

    const user = await User.findById(userId);
    const targetUser = await User.findById(followUserId);

    const isFollowing = user.following.includes(followUserId);

    if (isFollowing) {
      user.following.pull(followUserId);
      targetUser.followers.pull(userId);
    } else {
      user.following.push(followUserId);
      targetUser.followers.push(userId);
    }

    await user.save();
    await targetUser.save();

    res.json({ message: "Follow updated" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================================================
   COMMENTS SECTION
========================================================= */

app.post("/add-comment", async (req, res) => {
  try {
    const { postId, userId, text } = req.body;

    const comment = await Comment.create({
      post: postId,
      user: userId,
      text,
    });

    const populatedComment = await comment.populate(
      "user",
      "username profileImage"
    );

    res.status(201).json(populatedComment);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/get-comments/:postId", async (req, res) => {
  try {
    const comments = await Comment.find({
      post: req.params.postId,
    })
      .populate("user", "username profileImage")
      .sort({ createdAt: -1 });

    res.json(comments);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/get-tryons/:userId", async (req, res) => {
  try {
    const tryons = await TryOn.find({
      user: req.params.userId,
    }).sort({ createdAt: -1 });

    res.json(tryons);
  } catch (error) {
    res.status(500).json({ message: "Error fetching tryons" });
  }
});
/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT,"0.0.0.0", () =>
  console.log(`🚀 Server running at http://${SERVER_IP}:${PORT}`)
);