console.log("Starting FoodHub Backend Server v2..."); // Dấu hiệu để nhận biết server đã khởi động lại
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const path = require("path"); // Thêm module path
require("dotenv").config(); // Nạp biến môi trường

const Dish = require("./models/Dish");
const User = require("./models/User"); // Import User model
const BannerSlide = require("./models/BannerSlide"); // Import BannerSlide model
const Notification = require("./models/Notification"); // Import Notification model

const app = express();
const port = 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Server-Sent Events (SSE) Setup ---
let clients = []; // Mảng lưu trữ các client đang kết nối

// Hàm gửi sự kiện đến tất cả các client
function sendEventToClients(data) {
  clients.forEach((client) =>
    client.res.write(`data: ${JSON.stringify(data)}\n\n`)
  );
}

// Wrapper cho console.log và console.error để gửi sự kiện
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => {
  originalLog.apply(console, args);
  sendEventToClients({ type: "log", message: args.join(" ") });
};
console.error = (...args) => {
  originalError.apply(console, args);
  sendEventToClients({ type: "error", message: args.join(" ") });
};

// --- Kết nối MongoDB ---
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected successfully!"))
  .catch((err) => console.error("MongoDB connection error:", err));
originalLog("Starting FoodHub Backend Server v2..."); // Dùng bản gốc để tránh gửi event này

// --- Root Endpoint ---
// Thêm một route cho đường dẫn gốc ("/") để kiểm tra server
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Welcome to FoodHub API! The server is running correctly.",
  });
});

// --- API Endpoints ---

// Endpoint cho Server-Sent Events
app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders(); // Gửi headers ngay lập tức

  const clientId = Date.now();
  const newClient = {
    id: clientId,
    res,
  };
  clients.push(newClient);
  originalLog(`Client ${clientId} connected to SSE.`);

  req.on("close", () => {
    clients = clients.filter((client) => client.id !== clientId);
    originalLog(`Client ${clientId} disconnected from SSE.`);
  });
});

// Endpoint để lấy tất cả món ăn
app.get("/api/dishes", async (req, res) => {
  try {
    // Chỉ lấy các trường cần thiết, loại bỏ imageData và contentType để giảm kích thước payload
    const dishes = await Dish.find({}).select("-imageData -contentType");
    res.json(dishes);
  } catch (error) {
    console.error("Error fetching dishes:", error);
    // Gửi lỗi chi tiết về client để debug
    res.status(500).json({
      message: "Server error when fetching dishes",
      error: error.message,
    });
  }
});

// Endpoint để phục vụ ảnh món ăn từ MongoDB
app.get("/api/dishes/:id/image", async (req, res) => {
  try {
    const dish = await Dish.findById(req.params.id);
    if (!dish || !dish.imageData || !dish.contentType) {
      return res.status(404).send("Image not found");
    }
    res.set("Content-Type", dish.contentType);
    res.send(dish.imageData);
  } catch (error) {
    console.error("Error serving image:", error);
    res.status(500).send("Server error");
  }
});

// Endpoint to register a new user
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ message: "Vui lòng điền đầy đủ thông tin." });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: "Tên người dùng hoặc email đã tồn tại." });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create and save the new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
    });

    const savedUser = await newUser.save();

    res.status(201).json({
      message: "Đăng ký thành công!",
      user: {
        id: savedUser._id,
        username: savedUser.username,
        email: savedUser.email,
      },
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({
      message: "Lỗi máy chủ khi đăng ký người dùng.",
      error: error.message,
    });
  }
});

// Endpoint for user login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập email và mật khẩu." });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(401)
        .json({ message: "Email hoặc mật khẩu không đúng." });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Email hoặc mật khẩu không đúng." });
    }

    // On successful login, return user info (without password)
    res.status(200).json({
      message: "Đăng nhập thành công!",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({
      message: "Lỗi máy chủ khi đăng nhập.",
      error: error.message,
    });
  }
});

// Endpoint để lấy tất cả banner slides
app.get("/api/bannerslides", async (req, res) => {
  try {
    const bannerSlides = await BannerSlide.find({}).select(
      "-imageData -contentType"
    );
    res.json(bannerSlides);
  } catch (error) {
    console.error("Error fetching banner slides:", error);
    res.status(500).json({
      message: "Server error when fetching banner slides",
      error: error.message,
    });
  }
});

// Endpoint để phục vụ ảnh banner slide từ MongoDB
app.get("/api/bannerslides/:id/image", async (req, res) => {
  try {
    // Thêm bước kiểm tra tính hợp lệ của ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send("Invalid ID format");
    }

    const slide = await BannerSlide.findById(req.params.id);
    if (!slide || !slide.imageData || !slide.contentType) {
      return res.status(404).send("Image not found");
    }
    res.set("Content-Type", slide.contentType);
    res.send(slide.imageData);
  } catch (error) {
    console.error("Error serving banner image:", error);
    res.status(500).send("Server error");
  }
});

// --- Notification Endpoints ---

// Endpoint để lấy tất cả thông báo
app.get("/api/notifications", async (req, res) => {
  try {
    // Lấy các thông báo mới nhất, giới hạn 20
    const notifications = await Notification.find({})
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      message: "Server error when fetching notifications",
      error: error.message,
    });
  }
});

// Endpoint để tạo một thông báo mới (để test)
app.post("/api/notifications", async (req, res) => {
  try {
    const { title, description, image, link, time } = req.body;

    if (!title || !description || !image || !time) {
      return res
        .status(400)
        .json({ message: "Vui lòng cung cấp đủ các trường bắt buộc." });
    }

    const newNotification = new Notification({
      title,
      description,
      image,
      link,
      time,
    });
    const savedNotification = await newNotification.save();
    res.status(201).json(savedNotification);
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi tạo thông báo." });
  }
});

app.listen(port, () => {
  originalLog(`Server is running on port ${port}`);
});
