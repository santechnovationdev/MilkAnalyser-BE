
require("dotenv").config();

const Express = require("express");
const cors = require("cors");
const Mongoose = require("mongoose");
const Session = require("express-session");
const MongoDbSession = require("connect-mongodb-session")(Session);

const MilkPredictRouter = require("./routes/MilkPredictRouter");
const SensorDataRouter = require("./routes/SensorRouter");
const AuthRouter = require("./routes/AuthRouter");
const dashboardRouter = require("./routes/dashboardRouter");
const reportRoutes = require("./routes/reportRoutes");
const farmerRoutes = require("./routes/farmerRoutes");
const mqttRoutes = require("./routes/MqttRouter");
const otp = require('./routes/OTPRouter')

const milkTestRouter = require("./routes/milkTestRoutes");
const farmerDashboardRouter = require("./routes/FarmerDashboardRouter");
const { connectMQTT, resumeActiveCollection } = require("./services/mqttxService");
const { initializeMilkTestService } = require("./services/milkTestService");

const app = Express();
const port = process.env.PORT || 4023;

const corsOptions = {
    origin: [
        "http://localhost:4002",
        "http://localhost:3000",
        "http://localhost:3001",
        "https://milkanalyser.santechnovation.com"
    ],
    credentials: true
};

app.use(cors(corsOptions));
app.use(Express.json());
app.use(Express.urlencoded({ extended: true }));

// MongoDB session store
const store = new MongoDbSession({
    uri: process.env.MONGODB_URL,
    collection: "sessions"
});

// Session middleware
app.use(
    Session({
        secret: process.env.SessionKey,
        resave: false,
        saveUninitialized: false,
        store: store,
        cookie: {
            secure: true,
            httpOnly: true,
            sameSite: 'none'
        }
    }))



app.set('trust proxy', 1)

// API routes
app.use(SensorDataRouter);
app.use(MilkPredictRouter);
app.use(AuthRouter);
app.use("/dashboard", dashboardRouter);
app.use("/milk-test", milkTestRouter);
app.use("/farmer-dashboard", farmerDashboardRouter);
app.use(reportRoutes);
app.use(farmerRoutes);
app.use(mqttRoutes);
app.use(otp)

// ============================================
// START BACKEND
// ============================================


async function startServer() {
    try {
        // 1. Connect MongoDB
        await Mongoose.connect(process.env.MONGODB_URL);

        console.log("Connected to MongoDB");

        // 2. Restore existing collection workflow
        await resumeActiveCollection();

        console.log("Existing collection workflow restored.");

        // 3. Connect existing MQTT service
        await connectMQTT();

        console.log("Existing MQTT service connected.");

        // 4. Initialize Milk Test service
        await initializeMilkTestService();

        console.log("Milk Test service initialized.");

        // 5. Start Express server
        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });

    } catch (error) {
        console.error("Backend startup failed:", error);

        process.exit(1);
    }
}

startServer();