
const XLSX = require("xlsx");
const path = require("path");

const SPECTRAL_COLUMNS = [
    "A410", "B435", "C460", "D485",
    "E510", "F535", "G560", "H585",
    "R610", "I645", "S680", "J705",
    "T730", "U760", "V810", "W860",
    "K900", "L940"
];

const DATASET_PATHS = {
    adulteration: path.join(
        __dirname,
        "../datasets/Milk_Adulteration_Combined_Labeled_Dataset_Final.xlsx"
    ),

    analysis: path.join(
        __dirname,
        "../datasets/Milk_Analysis_Combined_Labeled_Dataset_Final.xlsx"
    )
};

// Read the first worksheet from an Excel workbook.
function readExcel(filePath) {
    const workbook = XLSX.readFile(filePath);

    const sheetName = workbook.SheetNames.includes("Combined Dataset")
        ? "Combined Dataset"
        : workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];

    return XLSX.utils.sheet_to_json(worksheet, {
        defval: null,
        raw: true
    });
}

// Validate spectral columns.
function validateSpectralColumns(rows) {
    if (!rows.length) {
        throw new Error("Excel dataset is empty.");
    }

    const missing = SPECTRAL_COLUMNS.filter(
        column => !(column in rows[0])
    );

    if (missing.length) {
        throw new Error(
            `Missing spectral columns: ${missing.join(", ")}`
        );
    }
}

function toNumber(value, fieldName, rowNumber) {
    if (
        value === null ||
        value === undefined ||
        String(value).trim() === ""
    ) {
        throw new Error(
            `Missing ${fieldName} at row ${rowNumber}.`
        );
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        throw new Error(
            `Invalid ${fieldName} at row ${rowNumber}.`
        );
    }

    return number;
}

// Adulteration classification dataset.
function loadAdulterationDataset() {
    const rows = readExcel(DATASET_PATHS.adulteration);

    validateSpectralColumns(rows);

    const features = [];
    const labels = [];
    const originalLabels = [];

    rows.forEach((row, index) => {
        const rowNumber = index + 2;

        const spectralValues = SPECTRAL_COLUMNS.map(
            column => toNumber(row[column], column, rowNumber)
        );

        const label = toNumber(
            row.Label,
            "Label",
            rowNumber
        );

        if (
            !Number.isInteger(label) ||
            label < 1 ||
            label > 7
        ) {
            throw new Error(
                `Invalid adulteration label at row ${rowNumber}.`
            );
        }

        features.push(spectralValues);
        labels.push(label - 1);
        originalLabels.push(label);
    });

    return {
        features,
        labels,
        originalLabels,
        featureNames: SPECTRAL_COLUMNS,
        classCount: 7,
        sampleCount: features.length
    };
}

// Milk analysis regression dataset.
function loadMilkAnalysisDataset() {
    const rows = readExcel(DATASET_PATHS.analysis);

    validateSpectralColumns(rows);

    const targetColumns = [
        "Fat_Percent",
        "SNF_Percent",
        "Water_Percent"
    ];

    const features = [];
    const targets = [];

    rows.forEach((row, index) => {
        const rowNumber = index + 2;

        const spectralValues = SPECTRAL_COLUMNS.map(
            column => toNumber(row[column], column, rowNumber)
        );

        const targetValues = targetColumns.map(
            column => toNumber(row[column], column, rowNumber)
        );

        features.push(spectralValues);
        targets.push(targetValues);
    });

    return {
        features,
        targets,
        featureNames: SPECTRAL_COLUMNS,
        targetNames: targetColumns,
        sampleCount: features.length
    };
}

// Standard scaler.
function fitStandardScaler(data) {
    if (!data.length) {
        throw new Error("Cannot scale empty dataset.");
    }

    const featureCount = data[0].length;

    const means = Array(featureCount).fill(0);
    const standardDeviations = Array(featureCount).fill(0);

    data.forEach(row => {
        row.forEach((value, index) => {
            means[index] += value;
        });
    });

    for (let i = 0; i < featureCount; i++) {
        means[i] /= data.length;
    }

    data.forEach(row => {
        row.forEach((value, index) => {
            standardDeviations[index] +=
                Math.pow(value - means[index], 2);
        });
    });

    for (let i = 0; i < featureCount; i++) {
        standardDeviations[i] = Math.sqrt(
            standardDeviations[i] / data.length
        );

        if (standardDeviations[i] < 1e-8) {
            standardDeviations[i] = 1;
        }
    }

    return { means, standardDeviations };
}

function transformData(data, scaler) {
    return data.map(row =>
        row.map((value, index) =>
            (value - scaler.means[index]) /
            scaler.standardDeviations[index]
        )
    );
}

function inverseTransformData(data, scaler) {
    return data.map(row =>
        row.map((value, index) =>
            value * scaler.standardDeviations[index] +
            scaler.means[index]
        )
    );
}

function getDatasetSummary() {
    const adulteration = loadAdulterationDataset();
    const analysis = loadMilkAnalysisDataset();

    const classDistribution = {};

    adulteration.originalLabels.forEach(label => {
        classDistribution[label] =
            (classDistribution[label] || 0) + 1;
    });

    return {
        adulteration: {
            samples: adulteration.sampleCount,
            features: adulteration.featureNames.length,
            classes: adulteration.classCount,
            classDistribution
        },
        analysis: {
            samples: analysis.sampleCount,
            features: analysis.featureNames.length,
            targets: analysis.targetNames
        }
    };
}

module.exports = {
    SPECTRAL_COLUMNS,
    loadAdulterationDataset,
    loadMilkAnalysisDataset,
    fitStandardScaler,
    transformData,
    inverseTransformData,
    getDatasetSummary
};
