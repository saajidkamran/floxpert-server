require("dotenv").config();
const { google } = require("googleapis");
const fs = require("fs");
s;
const mongoose = require("mongoose");
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const multer = require("multer");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const checkAuth = require("./middleware/auth-verify");
const { Storage } = require("@google-cloud/storage");
app.use(cors());
app.use(express.static("./uploads")); // where images and all saved folder
app.use(express.json());
app.use(
  bodyParser.urlencoded({
    extended: false,
  })
);
const jsonKey = process.env.GOOGLE_APPLICATION_CREDENTIALS;
app.use(bodyParser.json());
const gStorage = new Storage({ credentials: JSON.parse(jsonKey) });

mongoose
  .connect(process.env.MONGODB_CONNECTION, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

const productSchema = new mongoose.Schema({
  title: String,
  location: String,
  bedroomCount: Number,
  perches: String,
  price: String,
  description: String,
  category: String,
  image: [],
});
const userSchema = mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  email: {
    type: String,
    required: true,
    unique: true,
    match:
      /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/,
  },
  password: { type: String, required: true },
});

const User = mongoose.model("User", userSchema);
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
  .post(checkAuth, upload.array("image", 20), async (req, res, next) => {
    try {
      const files = req.files;
      const {
        title,
        bedroomCount,
        perches,
        price,
        description,
        category,
        location,
      } = req.body;
      const uploadedImages = [];
      for (const file of files) {
        const fileName = file.filename;
        const localFilePath = file.path;
        const [gcsFile] = await gStorage
          .bucket("floxpert-backend")
          .upload(localFilePath, {
            destination: fileName,
          });
        const imageReference = gcsFile.metadata.mediaLink;
        uploadedImages.push(imageReference);
      }
      const product = new Products({
        title,
        bedroomCount,
        perches,
        price,
        description,
        category,
        location,
        image: uploadedImages,
      });
      await product.save();
      return res.status(200).send(product);
    } catch (error) {
      console.log(error);
      return res.status(500).send(error);
    }
  });
// Load client secrets from a file you've downloaded from the Google Developers Console.
const credentials = require("./googleauth/gcred.json");
// Create an OAuth2 client
const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

app.delete("/products/:id", checkAuth, async (req, res, next) => {
  const { id } = req.params;

  try {
    const prod = await Products.findByIdAndDelete(id);
    const findProds = await Products.findById(id);
    const images = findProds.image;
    const bucket = await gStorage.bucket("floxpert-backend");
    for (const image of images) {
      try {
        const urlParts = image.split("?");
        const pathParts = urlParts[0].split("/");
        const objectName = decodeURIComponent(pathParts[pathParts.length - 1]);
        const file = bucket.file(objectName);
        const exists = await file.exists();

        if (exists[0]) {
          await file.delete();
        }
      } catch (error) {
        console.error(error);
        res.status(500).send(error);
      }
    }

    res.send(prod);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});
app.post("/signup", async (req, res) => {
  try {
    const authUser = await User.find({ email: req.body.email }).exec();
    if (authUser.length >= 1) {
      return res.status(409).json({
        error: "user exist",
      });
    } else {
      bcrypt.hash(req.body.password, 10, async (err, hash) => {
        if (err) {
          return res.status(500).json({
            error: err,
          });
        } else {
          try {
            const user = new User({
              _id: new mongoose.Types.ObjectId(),
              email: req.body.email,
              password: hash,
            });
            await user.save();
            res.status(201).json({
              message: "user created",
            });
          } catch (error) {
            res.status(500).json({
              error: error,
            });
          }
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      error: error,
    });
  }
});

app.delete("/:userId", (req, res, next) => {
  User.remove({ _id: req.params.userId })
    .exec()
    .then((result) => {
      res.status(200).json({
        message: "User deleted",
      });
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({
        error: err,
      });
    });
});

app.post("/login", (req, res, next) => {
  User.find({ email: req.body.email })
    .exec()
    .then((user) => {
      if (user.length < 1) {
        return res.status(401).json({
          message: "Auth failed",
        });
      }
      bcrypt.compare(req.body.password, user[0].password, (err, result) => {
        if (err) {
          return res.status(401).json({
            message: "Auth failed",
          });
        }
        if (result) {
          const token = jwt.sign(
            {
              email: user[0].email,
              userId: user[0]._id,
            },
            process.env.JWT_KEY,
            {
              expiresIn: "1h",
            }
          );
          return res.status(200).json({
            message: "Auth successful",
            token: token,
          });
        }
        res.status(401).json({
          message: "Auth failed",
        });
      });
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({
        error: err,
      });
    });
});
app.listen(process.env.PORT || 3000, function () {
  console.log("Express server listening on port %d in %s mode");
});
