
const puppeteer = require("puppeteer");

// =======================================
// HTML ESCAPE
// =======================================

const escapeHtml = (value) => {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
};

// =======================================
// DISPLAY VALUE
// =======================================

const displayValue = (value) => {
    if (value === null || value === undefined || value === "") {
        return "Not available";
    }

    return String(value);
};

// =======================================
// TABLE ROW
// =======================================

const renderRow = (label, value) => {
    return `
        <tr>
            <th>${escapeHtml(label)}</th>
            <td>${escapeHtml(displayValue(value))}</td>
        </tr>
    `;
};

// =======================================
// FORMAT CONFIDENCE
// =======================================

const formatConfidence = (value) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "Not available";
    }

    // Your schema stores confidence between 0 and 1.
    return `${(Number(value) * 100).toFixed(2)}%`;
};

// =======================================
// DOWNLOAD PDF CONTROLLER
// =======================================

const downloadPredictionPdf = async (req, res) => {
    let browser;

    try {
        const { farmer, prediction, testId } = res.locals.pdfData || {};

        if (!farmer || !prediction) {
            return res.status(404).json({
                success: false,
                message: "Farmer or prediction not found"
            });
        }

        // =======================================
        // FARMER DETAILS
        // =======================================

        const farmerSection = `
            <div class="section">
                <h2>Farmer Details</h2>

                <table>
                    ${renderRow(
            "Farmer ID",
            farmer.farmerId
        )}

                    ${renderRow(
            "Farmer Name",
            farmer.name
        )}

                    ${renderRow(
            "Contact Number",
            farmer.contact
        )}

                    ${renderRow(
            "Village",
            farmer.village
        )}
                </table>
            </div>
        `;

        // =======================================
        // PREDICTION RESULTS
        // =======================================

        let predictionSection = "";

        const isMilk = prediction.sampleType === "Milk";

        const predictionCompleted = prediction.predictionStatus === "completed";

        if (!predictionCompleted) {
            predictionSection = `
                <div class="warning">
                    Prediction was not completed successfully.
                </div>
            `;
        } else if (!isMilk) {
            predictionSection = ` <table>
                    ${renderRow("Sample Type", prediction.sampleType)}

                    ${renderRow(
                "Detection Confidence",
                formatConfidence(
                    prediction.sampleTypeConfidence
                )
            )}
                </table>

                <div class="warning">
                    ${escapeHtml(
                prediction.message ||
                "Please add milk to the glass."
            )}
                </div>
            `;
        } else {
            // Always show detected sample type.
            predictionSection = `
                <table>
                    ${renderRow("Sample Type", prediction.sampleType)}

                    ${renderRow(
                "Detection Confidence",
                formatConfidence(
                    prediction.sampleTypeConfidence
                )
            )}
                </table>
            `;

            // =======================================
            // MODE 1 - MILK QUALITY
            // =======================================

            if (Number(prediction.mode) === 1) {
                predictionSection += `
                    <h3>Milk Quality Analysis</h3>

                    <table>
                        ${renderRow(
                    "SNF",
                    prediction.snf
                )}

                        ${renderRow(
                    "Fat",
                    prediction.fat
                )}

                        ${renderRow(
                    "Water",
                    prediction.water
                )}
                    </table>
                `;
            }

            // =======================================
            // MODE 0 - ADULTERATION
            // =======================================

            if (Number(prediction.mode) === 0) {
                predictionSection += `
                    <h3>Adulteration Result</h3>
                `;

                if (
                    prediction.adulterationPresent === true
                ) {
                    predictionSection += `
                        <table>
                            ${renderRow(
                        "Adulteration Type",
                        prediction.adulterationType
                    )}

                            ${renderRow(
                        "Confidence Level",
                        formatConfidence(
                            prediction.adulterationConfidence
                        )
                    )}
                        </table>
                    `;
                } else if (
                    prediction.adulterationPresent === false
                ) {
                    predictionSection += `
                        <div class="success">
                            No adulteration detected
                        </div>
                    `;
                } else {
                    predictionSection += `
                        <div class="warning">
                            Adulteration status is not available.
                        </div>
                    `;
                }
            }
        }

        // =======================================
        // HTML TEMPLATE
        // =======================================

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />

            <style>
                * {
                    box-sizing: border-box;
                }

                body {
                    margin: 0;
                    padding: 30px;
                    font-family: Arial, sans-serif;
                    color: #1e293b;
                    background: #ffffff;
                }

                .header {
                    background: #2563eb;
                    color: white;
                    text-align: center;
                    padding: 26px;
                    border-radius: 12px;
                }

                .header h1 {
                    margin: 0;
                    font-size: 27px;
                    letter-spacing: 1px;
                }

                .header p {
                    margin: 8px 0 0;
                    font-size: 13px;
                }

                .section {
                    margin-top: 25px;
                    break-inside: avoid;
                }

                h2 {
                    color: #2563eb;
                    font-size: 17px;
                    border-bottom: 2px solid #dbeafe;
                    padding-bottom: 10px;
                }

                h3 {
                    color: #334155;
                    font-size: 15px;
                    margin-top: 22px;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 12px;
                }

                th, td {
                    border: 1px solid #e2e8f0;
                    padding: 12px;
                    font-size: 13px;
                    text-align: left;
                    overflow-wrap: anywhere;
                }

                th {
                    width: 40%;
                    background: #f1f5f9;
                    font-weight: 600;
                }

                .success {
                    margin-top: 15px;
                    padding: 15px;
                    background: #dcfce7;
                    color: #166534;
                    font-weight: bold;
                    border-radius: 8px;
                }

                .warning {
                    margin-top: 15px;
                    padding: 15px;
                    background: #fef3c7;
                    color: #92400e;
                    border-radius: 8px;
                }

                .footer {
                    margin-top: 35px;
                    border-top: 1px solid #e2e8f0;
                    padding-top: 12px;
                    text-align: center;
                    font-size: 11px;
                    color: #64748b;
                }
            </style>
        </head>

        <body>
            <div class="header">
                <h1>MILK ANALYZER</h1>
                <p>Milk Test Prediction Report</p>
            </div>

            ${farmerSection}

            <div class="section">
                <h2>Prediction Results</h2>
                ${predictionSection}
            </div>

            <div class="footer">
                <p>
                    Test ID:
                    ${escapeHtml(testId)}
                </p>

                <p>
                    Prediction Date:
                    ${escapeHtml(
            prediction.createdAt
                ? new Date(
                    prediction.createdAt
                ).toLocaleString("en-IN")
                : "Not available"
        )}
                </p>

                <p>Generated by Milk Analyzer</p>
            </div>
        </body>
        </html>
        `;

        // =======================================
        // PUPPETEER PDF GENERATION
        // =======================================

        browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox"
            ]
        });

        const page = await browser.newPage();

        await page.setContent(html, {
            waitUntil: "load"
        });

        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "15mm",
                bottom: "15mm",
                left: "15mm",
                right: "15mm"
            }
        });

        const safeTestId = String(testId)
            .replace(/[^a-zA-Z0-9_-]/g, "_");

        res.setHeader(
            "Content-Type",
            "application/pdf"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="Milk_Analyzer_${safeTestId}.pdf"`
        );

        return res.end(pdfBuffer);

    } catch (error) {
        console.error(
            "PDF Generation Error:",
            error
        );

        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: "Unable to generate PDF"
            });
        }
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

module.exports = {
    downloadPredictionPdf
};
