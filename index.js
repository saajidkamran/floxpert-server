require("dotenv").config();
const mongoose = require("mongoose");
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const multer = require("multer");
const cors = require("cors");

app.use(cors());
app.use(express.static("./uploads")); // where images and all saved folder
app.use(express.json());
app.use(
  bodyParser.urlencoded({
    extended: false,
  })
);
app.use(bodyParser.json());

mongoose
  .connect(process.env.MONGODB_CONNECTION, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));
const subSchema = new mongoose.Schema({
  name: String,
});
const productSchema = new mongoose.Schema({
  title: String,
  location: String,
  bedroomCount: Number,
  perches: String,
  price: Number,
  description: String,
  category: String,
  image: [],
});

const Products = mongoose.model("Products", productSchema);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./uploads");
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === "image/jpeg" ||
    file.mimetype === "image/png" ||
    file.mimetype === "image/jpg"
  ) {
    cb(null, true);
  } else {
    cb(new Error("mimetype not recoganized"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
});
app
  .route("/products")
  .get(async (req, res) => {
    try {
      const findProds = await Products.find();
      return res.status(200).send(findProds);
    } catch (error) {
      return res.status(500).send(error);
    }
  })
  .post(upload.array("image", 20), async (req, res, next) => {
    try {
      const fileUrls = [];
      req.files.map((image) => {
        fileUrls.push(image.path.replace(/\\/g, "/"));
      });

      const { name, bedroomCount, price, description, category } = req.body;

      const product = new Products({
        title,
        bedroomCount,
        perches,
        price,
        description,
        category,
        location,
        image: fileUrls,
      });
      await product.save();
      return res.status(200).send(product);
    } catch (error) {
      return res.status(500).send(error);
    }
  });

app.delete("/products/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const prod = await Products.findByIdAndDelete(id);
    res.send(prod);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

app.listen(3000, function () {
  console.log("im on port 3000");
});
