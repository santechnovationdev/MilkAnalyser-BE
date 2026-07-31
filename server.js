require('dotenv').config();
const Express = require('express');
const cors = require('cors');
const Mongoose = require('mongoose');
const Session = require('express-session');
const MongoDbSession = require('connect-mongodb-session')(Session);
// const path = require("path");
const MilkPredictRouter = require('./routes/MilkPredictRouter')
const SensorDataRouter = require('./routes/SensorRouter')
const AuthRouter = require('./routes/AuthRouter')
const dashboardRouter = require("./routes/dashboardRouter");
const reportRoutes = require("./routes/reportRoutes");
const farmerRoutes = require("./routes/farmerRoutes")

const app = Express();
const port = process.env.PORT || 5004;

const corsOptions = {
    origin: ["http://localhost:4002", "http://localhost:3000",],
    credentials: true,
};


app.use(cors(corsOptions));
app.use(Express.json());
app.use(Express.urlencoded({ extended: true }));
// app.use("/uploads", Express.static(path.join(__dirname, "uploads")));
// app.set('trust proxy', 1)


Mongoose.connect(process.env.MONGODB_URL)
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch((err) => {
        console.log("Error in connecting to MongoDB:", err);
    })

const store = new MongoDbSession({
    uri: process.env.MONGODB_URL,
    collection: 'sessions'
})

app.use(Session({

    secret: process.env.SessionKey,
    resave: false,
    saveUninitialized: false,
    store: store,
    // cookie: {
    //     secure: true,
    //     httpOnly: true,
    //     sameSite: 'none'
    // }
}))

app.use(SensorDataRouter)
app.use(MilkPredictRouter)
app.use(AuthRouter)
app.use(dashboardRouter)
app.use(reportRoutes)
app.use(farmerRoutes);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})
