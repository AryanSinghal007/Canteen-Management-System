//jshint esversion:6
//IMPORT MODULES

const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const _ = require("lodash");
const { time, log } = require("console");
const app = express();
const md5 = require("md5");
const session = require("express-session");
require("dotenv").config();

// app.use(session({
//   secret: "vidyanjghal",
//   resave: false,
//   saveUninitialized: true
// }));

app.use(
    session({
        secret: process.env.SECRET,
        resave: false,
        saveUninitialized: true,
    })
);

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

mongoose.connect(
    `mongodb+srv://finstop:${process.env.MONGO_PASSWORD}@cluster0.d7sp04r.mongodb.net/canteenDB`,
    { useNewUrlParser: true, useUnifiedTopology: true }
);
// mongoose.connect("mongodb+srv://finstop:apnafinstop@cluster0.d7sp04r.mongodb.net/canteenDB", { useNewUrlParser: true, useUnifiedTopology: true })
//Mongoose db
const inventorySchema = {
    foodName: String,
    foodQuantity: Number,
    foodPrice: Number,
};

const MySchema = new mongoose.Schema({
    username: String,
    hashmapField: {
        type: Map,
        of: Number,
    },
});

const authSchema = new mongoose.Schema({
    nameauth: String,
    rollno: { type: String, unique: true },
    password: String,
});

const contactSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
});

const Contact = mongoose.model("Contact", contactSchema);
const userOrder = mongoose.model("userOrder", MySchema);
const fooditem = mongoose.model("fooditem", inventorySchema);
const authuser = mongoose.model("authuser", authSchema);

function requireLogin(req, res, next) {
    // Check if the user is logged in
    if (!req.session.isLoggedIn) {
        // User is not logged in, redirect to the login page
        return res.redirect("/login");
    }
    // User is logged in, proceed to the next middleware
    next();
}

app.get("/login", function (req, res) {
    res.render("login", { errorMessage: null });
});

app.get("/register", function (req, res) {
    res.render("register", { errorMessage: null });
});

app.get("/", function (req, res) {
    res.render("login", { errorMessage: null });
});

app.post("/register", function (req, res) {
    const name = req.body.name;
    const rollNo = req.body.rollNo;
    const password = md5(req.body.password); // Hash the password

    authuser
        .findOne({ rollno: rollNo })
        .then((existingUser) => {
            if (existingUser) {
                // Redirect to the register page with an error message
                res.render("register", { errorMessage: "Roll No. already in use !" });
            } else {
                // Create a new user
                const user = new authuser({
                    nameauth: name,
                    rollno: rollNo,
                    password: password,
                });

                user
                    .save()
                    .then(() => {
                        res.redirect("/login");
                    })
                    .catch((error) => {
                        console.log("error");
                        res.status(500).send("Error registering user");
                    });
            }
        })
        .catch((error) => {
            console.log(error);
            res.status(500).send("Error registering user");
        });
});

app.post("/login", function (req, res) {
    const rollNo = req.body.rollNo;
    const password = md5(req.body.password); // Hash the password

    authuser
        .findOne({ rollno: rollNo, password: password })
        .then((user) => {
            if (user) {
                // Assuming authentication is successful
                req.session.isLoggedIn = true; // Set isLoggedIn to true
                req.session.user = user; // Store user information in the session if needed
                res.redirect("/home");
            } else {
                res.render("login", { errorMessage: "Invalid Credentials" });
            }
        })
        .catch((error) => {
            console.log(error);
            res.status(500).send("Error logging in");
        });
});

app.get("/home", requireLogin, function (req, res) {
    res.render("home");
});

app.get("/menu", requireLogin, function (req, res) {
    fooditem
        .find({})
        .then((fooditems) => {
            res.render("menu", {
                fooditems: fooditems,
            });
        })
        .catch((error) => {
            console.log(error);
            res.status(500).send("Error retrieving data");
        });
});

app.get("/order", requireLogin, function (req, res) {
    let fooditems;
    let userOrders;

    Promise.all([fooditem.find({}), userOrder.find({})])
        .then(([fooditemsarr, userOrdersarr]) => {
            fooditems = fooditemsarr;
            userDonates = userOrdersarr;

            res.render("order", {
                fooditems: fooditems,
                userDonates: userOrders,
                UserName: req.session.user.name, // Pass the user's name to the template
                rollNo: req.session.user.rollno, // Pass the roll number to the template
            });
        })
        .catch((error) => {
            console.log(error);
            res.status(500).send("Error retrieving data");
        });
});

app.post("/order", function (req, res) {
    const hashmapString = req.body.hashmap;
    let mapping;

    if (hashmapString) {
        try {
            mapping = JSON.parse(hashmapString);
        } catch (error) {
            console.log("Error parsing hashmap JSON:", error);
            return res.status(400).send("Invalid hashmap data");
        }
    }

    // Get the user details from the authuser collection
    authuser
        .findOne({ _id: req.session.user._id })
        .then((user) => {
            const UserName = user.nameauth;
            const rollNo = user.rollno;

            const newUserOrder = new userOrder({
                username: UserName,
                rollNo: rollNo,
                hashmapField: mapping,
            });

            newUserOrder.save();
            for (let key in mapping) {
                let newQuantity;
                fooditem
                    .findOne({ foodName: key })
                    .then((item) => {
                        newQuantity = item.foodQuantity - mapping[key];
                        return fooditem.findOneAndUpdate(
                            { foodName: key },
                            { $set: { foodQuantity: newQuantity } },
                            { new: true }
                        );
                    })
                    .catch((error) => {
                        console.log("Error updating food quantity:", error);
                    });
            }
            res.render("orderplaced", {
                mapping: mapping,
                UserName: UserName,
                rollNo: rollNo,
            });
        })
        .catch((error) => {
            console.log("Error retrieving user details:", error);
            return res.status(500).send("Error retrieving user details");
        });
});

app.get("/contact", requireLogin, function (req, res) {
    res.render("contact");
});

app.post("/contact", (req, res) => {
    const { name, email, message } = req.body;

    const newContact = new Contact({
        name,
        email,
        message,
    });

    newContact.save();
    res.redirect("/");
});

app.get("/addInventory", function (req, res) {
    res.render("addInventory.ejs");
});

app.post("/addInventory", function (req, res) {
    const foodName = req.body.foodName;
    const foodQuantity = req.body.foodQuantity;
    const foodPrice = req.body.foodPrice;

    const foodItem = new fooditem({
        foodName,
        foodQuantity,
        foodPrice,
    });

    foodItem
        .save()
        .then(() => {
            res.redirect("/");
        })
        .catch((error) => {
            console.log(error);
        });
});

app.get("/loginchef", function (req, res) {
    res.render("loginchef", { errorMessage: null });
});

app.post("/loginchef", (req, res) => {
    res.render("loginchef", { errorMessage: null });
});

//HOMECHEF NEECHE

app.get("/homechef", function (req, res) {
    res.render("homechef", { errorMessage: null });
});

app.post("/homechef", (req, res) => {
    const chefID = req.body.chefID;
    // console.log(chefID);
    if (chefID == 777) {
        res.render("homechef", { errorMessage: null });
    } else {
        res.render("loginchef", { errorMessage: "Invalid Chef ID" });
    }
});

// Orders Chef

const userOrdernew = mongoose.model("userOrder", MySchema);

app.get("/orderchef", function (req, res) {
    // Fetch all orders from the database
    userOrdernew
        .find({})
        .then((orders) => {
            // console.log(orders);
            res.render("orderchef", { orders: orders });
        })
        .catch((error) => {
            console.log("Error fetching orders:", error);
            res.status(500).send("Error fetching orders");
        });
});

app.post("/orderchef", (req, res) => {
    const orderId = req.body.orderId;

    // Delete the order from the database
    userOrdernew
        .findByIdAndDelete(orderId)
        .then(() => {
            // Send success response if needed
            console.log("Order deleted successfully");
            res.redirect("/orderchef"); // Redirect after successful deletion
        })
        .catch((error) => {
            console.error("Error deleting order:", error);
            res.status(500).send("Error deleting order");
        });
});

//DONATE NOW
app.get("/homedonate", function (req, res) {
    let fooditems;
    let userOrders;

    Promise.all([fooditem.find({}), userOrder.find({})])
        .then(([fooditemsarr, userOrdersarr]) => {
            fooditems = fooditemsarr;
            userDonates = userOrdersarr;

            res.render("homedonate", {
                fooditems: fooditems,
                userDonates: userOrders,
                UserName: req.session.user.name, // Pass the user's name to the template
                rollNo: req.session.user.rollno, // Pass the roll number to the template
            });
        })
        .catch((error) => {
            console.log(error);
            res.status(500).send("Error retrieving data");
        });
});

app.post("/homedonate", (req, res) => {
    const hashmapString = req.body.hashmap;
    let mapping;

    if (hashmapString) {
        try {
            mapping = JSON.parse(hashmapString);
        } catch (error) {
            console.log("Error parsing hashmap JSON:", error);
            return res.status(400).send("Invalid hashmap data");
        }
    }

    // Get the user details from the authuser collection
    authuser
        .findOne({ _id: req.session.user._id })
        .then((user) => {
            const UserName = user.nameauth;
            const rollNo = "Donation";

            const newUserOrder = new userOrder({
                username: "Donor: " + UserName,
                rollNo: rollNo,
                hashmapField: mapping,
            });

            newUserOrder.save();
            for (let key in mapping) {
                let newQuantity;
                fooditem
                    .findOne({ foodName: key })
                    .then((item) => {
                        newQuantity = item.foodQuantity - mapping[key];
                        return fooditem.findOneAndUpdate(
                            { foodName: key },
                            { $set: { foodQuantity: newQuantity } },
                            { new: true }
                        );
                    })
                    .catch((error) => {
                        console.log("Error updating food quantity:", error);
                    });
            }
            res.render("donationplaced", {
                mapping: mapping,
                UserName: UserName,
                rollNo: rollNo,
            });
        })
        .catch((error) => {
            console.log("Error retrieving user details:", error);
            return res.status(500).send("Error retrieving user details");
        });


});


const PORT = process.env.PORT || 3000;

app.listen(PORT, function () {
    console.log(`Server started on port ${PORT}`);
});
