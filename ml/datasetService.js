
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
        "../datasets/Milk_Adulteration_Updated_With_Pure_Milk.xlsx"
    ),

    analysis: path.join(
        __dirname,
        "../datasets/Milk_Analysis_Updated_With_Water_Empty.xlsx"
    )
};

const SAMPLE_TYPE_MAPPING = {
    Milk: 0,
    "Pure Water": 1,
    "Empty Glass": 2
};

// Adulteration label mapping.
// Model labels are zero-based internally.
const ADULTERATION_LABEL_MAPPING = {
    0: "Sugar",
    1: "Formalin",
    2: "Neutralizers",
    3: "Starch",
    4: "Hydrogen Peroxide",
    5: "Urea",
    6: "Detergent and Soap",
    7: "Pure Water",
    8: "Empty Glass",
    9: "Pure Milk"
};

// Read the Combined Dataset worksheet.
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

// 1. Adulteration classification dataset (10 classes).
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
            label > 10
        ) {
            throw new Error(
                `Invalid adulteration label at row ${rowNumber}.`
            );
        }

        features.push(spectralValues);

        // Convert Excel labels 1-10 into model labels 0-9.
        labels.push(label - 1);

        originalLabels.push(label);
    });

    return {
        features,
        labels,
        originalLabels,
        featureNames: SPECTRAL_COLUMNS,
        classCount: 10,
        sampleCount: features.length,
        labelMapping: ADULTERATION_LABEL_MAPPING
    };
}

// 2. Milk analysis regression dataset.
// Only Milk rows are used because Pure Water and Empty Glass
// do not contain Fat, SNF and Water target values.
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

        if (
            String(row.Sample_Type || "").trim() !== "Milk"
        ) {
            return;
        }

        const spectralValues = SPECTRAL_COLUMNS.map(
            column => toNumber(row[column], column, rowNumber)
        );

        const targetValues = targetColumns.map(
            column => toNumber(row[column], column, rowNumber)
        );

        features.push(spectralValues);
        targets.push(targetValues);
    });

    if (!features.length) {
        throw new Error("No valid Milk samples found for regression.");
    }

    return {
        features,
        targets,
        featureNames: SPECTRAL_COLUMNS,
        targetNames: targetColumns,
        sampleCount: features.length
    };
}

// 3. Sample type classification dataset.
// Milk = 0, Pure Water = 1, Empty Glass = 2.
function loadSampleTypeDataset() {
    const rows = readExcel(DATASET_PATHS.analysis);

    validateSpectralColumns(rows);

    const features = [];
    const labels = [];
    const originalLabels = [];

    rows.forEach((row, index) => {
        const rowNumber = index + 2;

        const sampleType = String(
            row.Sample_Type || ""
        ).trim();

        if (
            !Object.prototype.hasOwnProperty.call(
                SAMPLE_TYPE_MAPPING,
                sampleType
            )
        ) {
            throw new Error(
                `Invalid Sample_Type "${sampleType}" at row ${rowNumber}.`
            );
        }

        const spectralValues = SPECTRAL_COLUMNS.map(
            column => toNumber(row[column], column, rowNumber)
        );

        const label = SAMPLE_TYPE_MAPPING[sampleType];

        features.push(spectralValues);
        labels.push(label);
        originalLabels.push(sampleType);
    });

    return {
        features,
        labels,
        originalLabels,
        featureNames: SPECTRAL_COLUMNS,
        classCount: 3,
        sampleCount: features.length,
        labelMapping: {
            0: "Milk",
            1: "Pure Water",
            2: "Empty Glass"
        }
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

// Dataset summary.
function getDatasetSummary() {
    const adulteration = loadAdulterationDataset();
    const analysis = loadMilkAnalysisDataset();
    const sampleType = loadSampleTypeDataset();

    const adulterationDistribution = {};

    adulteration.originalLabels.forEach(label => {
        adulterationDistribution[label] =
            (adulterationDistribution[label] || 0) + 1;
    });

    const sampleTypeDistribution = {};

    sampleType.originalLabels.forEach(label => {
        sampleTypeDistribution[label] =
            (sampleTypeDistribution[label] || 0) + 1;
    });

    return {
        adulteration: {
            samples: adulteration.sampleCount,
            features: adulteration.featureNames.length,
            classes: adulteration.classCount,
            classDistribution: adulterationDistribution,
            labelMapping: adulteration.labelMapping
        },

        analysis: {
            samples: analysis.sampleCount,
            features: analysis.featureNames.length,
            targets: analysis.targetNames
        },

        sampleType: {
            samples: sampleType.sampleCount,
            features: sampleType.featureNames.length,
            classes: sampleType.classCount,
            classDistribution: sampleTypeDistribution,
            labelMapping: sampleType.labelMapping
        }
    };
}

module.exports = {
    SPECTRAL_COLUMNS,
    ADULTERATION_LABEL_MAPPING,
    loadAdulterationDataset,
    loadMilkAnalysisDataset,
    loadSampleTypeDataset,
    fitStandardScaler,
    transformData,
    inverseTransformData,
    getDatasetSummary
};
