// src/index.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createClient } from "@libsql/client";
import axios from "axios";
import fs from "fs"
import path from "path"
import { cors } from "hono/cors";

// import * as FDA from "../data/fda.json";
// import * as USDA from "../data/usda.json";



const app = new Hono();

app.use(cors({ origin: "*" }))



// Configure your Turso database client
const db = createClient({
  url:
    process.env.TURSO_DATABASE_URL || "libsql://recall-logno-dev.aws-us-west-2.turso.io",
  authToken: process.env.TURSO_AUTH_TOKEN || "",
});

// Endpoint to trigger data fetching and loading
app.get("/", async (c) => {
  return c.text(
    `FSIS Recalls API to Turso Database loader. Use /load-data to fetch and load data. ${process.env.ENV_TEST}`,
  );
});

app.get("/load-fda", async (c) => {
  try {
    const response = await axios.get('https://api.fda.gov/food/enforcement.json?sort=report_date:desc&limit=100');
    const recalls = response.data.results;

    let inserted = 0;
    let errors = 0;

    // Create database table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS reports (
        recall_number TEXT NOT NULL PRIMARY KEY,
        authority TEXT NOT NULL,
        status TEXT,
        city TEXT,
        state TEXT,
        country TEXT,
        classification TEXT,
        product_type TEXT,
        event_id TEXT,
        recalling_firm TEXT,
        address_1 TEXT,
        address_2 TEXT,
        postal_code TEXT,
        voluntary_mandated TEXT,
        initial_firm_notification TEXT,
        distribution_pattern TEXT,
        product_description TEXT,
        product_quantity TEXT,
        reason TEXT,
        recall_init_date TEXT,
        center_classification_date TEXT,
        termination_date TEXT,
        report_date TEXT,
        code_info TEXT,
        more_code_info TEXT,
        url TEXT,
        summary TEXT
      );
    `);


    // Process each recall and insert into database
    for (const report of recalls) {
      try {
        // Skip records that don't have a recall number
        if (!report?.recall_number) {
          console.warn("Skipping record without recall number");
          continue;
        }

        // Insert data into Turso database
        await db.execute({
          sql: `
            INSERT OR REPLACE INTO reports (
              recall_number,
              authority,
              status,
              city,
              state,
              country,
              classification,
              product_type,
              event_id,
              recalling_firm,
              address_1,
              address_2,
              postal_code,
              voluntary_mandated,
              initial_firm_notification,
              distribution_pattern,
              product_description,
              product_quantity,
              reason,
              recall_init_date,
              center_classification_date,
              termination_date,
              report_date,
              code_info,
              more_code_info
            ) VALUES (
              ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
            )
              `,
          args: [
            report.recall_number,
            "FDA",
            report.status || null,
            report.city || null,
            report.state || null,
            report.country || null,
            report.classification || null,
            report.product_type || null,
            report.event_id || null,
            report.recalling_firm || null,
            report.address_1 || null,
            report.address_2 || null,
            report.postal_code || null,
            report.voluntary_mandated || null,
            report.initial_firm_notification || null,
            report.distribution_pattern || null,
            report.product_description || null,
            report.product_quantity || null,
            report.reason_for_recall || null,
            report.recall_initiation_date || null,
            report.center_classification_date || null,
            report.termination_date || null,
            report.report_date || null,
            report.code_info || null,
            report.more_code_info || null
          ],
        });

        inserted++;
      } catch (error) {
        console.error(
          `Error inserting recall ${report.recall_number}:`,
          error,
        );
        errors++;
      }
    }

    return c.json({
      status: "success",
      message: `Processed ${recalls.length} recalls. Inserted: ${inserted}, Errors: ${errors}`,
      totalRecalls: recalls.length,
    });
  } catch (error) {
    console.error("Error fetching or processing data:", error);
    return c.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Endpoint to fetch and load data
app.get("/usda-file", async (c) => {
  console.log("loading USDA recalls to file")
  const filename = 'recalls.json'; // The file where the API response will be saved
  const filePath = path.join(process.cwd(), filename); // Path to the file in the current working directory

  try {
    // Fetch data from FSIS API
    const response = await fetch('https://www.fsis.usda.gov/fsis/api/recall/v/1?field_states_id=All&field_archive_recall=All&field_closed_date_value=&field_closed_year_id=All&field_risk_level_id=All&field_processing_id=All&field_product_items_value=meat&field_recall_classification_id=All&field_recall_number=&field_recall_reason_id=All&field_recall_type_id=All&field_related_to_outbreak=All&field_summary_value=&field_year_id=All&field_translation_language=All').then((res) => res.json());
    // Parse the JSON response
    const data = response.data;

    // Convert the JavaScript object to a pretty-printed JSON string
    // The 2 argument adds indentation for readability
    const jsonContent = JSON.stringify(data, null, 2);

    // 2. Write the content to the specified file asynchronously, overwriting it
    // fs.promises.writeFile will create the file if it doesn't exist, or overwrite it if it does.
    await fs.promises.writeFile(filePath, jsonContent);
    console.log(`API response successfully written to ${filePath}`);

    // Respond to the client indicating success
    return c.text(`USDA API response saved to ${filename} successfully!`);
  } catch (error) {
    // Log any errors that occur during fetching or file writing
    console.error('Failed to fetch data or write to file:', error);
    // Respond to the client with an error message
    return c.text(`An error occurred: ${error}`, 500); // 500 Internal Server Error
  }
})

app.get("/usda-sync", async (c) => {
  const filename = 'recalls.json'; // The file where the API response will be saved
  const filePath = path.join(process.cwd(), filename); // Path to the file in the current working directory

  try {

    const fileContent = await fs.promises.readFile(filePath, 'utf8');

    // 2. Parse the JSON content
    const data = JSON.parse(fileContent);

    let inserted = 0;
    let errors = 0;

    // Create database table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS reports (
        recall_number TEXT NOT NULL PRIMARY KEY,
        authority TEXT NOT NULL,
        status TEXT,
        city TEXT,
        state TEXT,
        country TEXT,
        classification TEXT,
        product_type TEXT,
        event_id TEXT,
        recalling_firm TEXT,
        address_1 TEXT,
        address_2 TEXT,
        postal_code TEXT,
        voluntary_mandated TEXT,
        initial_firm_notification TEXT,
        distribution_pattern TEXT,
        product_description TEXT,
        product_quantity TEXT,
        reason TEXT,
        recall_init_date TEXT,
        center_classification_date TEXT,
        termination_date TEXT,
        report_date TEXT,
        code_info TEXT,
        more_code_info TEXT,
        url TEXT,
        summary TEXT
      );
    `);


    // Process each recall and insert into database
    for (const report of data) {
      try {
        // Skip records that don't have a recall number
        if (!report.field_recall_number) {
          console.warn("Skipping record without recall number");
          continue;
        }
        if (report.langcode !== "English") {
          console.warn("Skipping record without Einglish");
          continue
        }

        // Insert data into Turso database
        await db.execute({
          sql: `
            INSERT OR REPLACE INTO reports (
              recall_number,
              authority,
              status,
              state,
              classification,
              product_type,
              recalling_firm,
              distribution_pattern,
              product_description,
              product_quantity,
              reason,
              center_classification_date,
              termination_date,
              report_date,
              url,
              summary
            ) VALUES (
              ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
            )
              `,
          args: [
            report.field_recall_number,
            "USDA",
            report.field_active_notice || null,
            report.field_states || null,
            report.field_recall_classification || null,
            report.field_processing || null,
            report.field_title || null,
            report.field_distro_list || null,
            report.field_product_items || null,
            report.field_qty_recovered || null,
            report.field_recall_reason || null,
            report.field_recall_date.toString().replaceAll("-", "") || null,
            report.field_closed_date.toString().replaceAll("-", "") || null,
            report.field_last_modified || null,
            report.field_recall_url || null,
            report.field_summary || null

          ],
        });

        inserted++;
      } catch (error) {
        console.error(
          `Error inserting recall ${report.field_recall_number}:`,
          error,
        );
        errors++;
      }

    }

    return c.json({
      status: "success",
      message: `Processed ${data.length} recalls. Inserted: ${inserted}, Errors: ${errors}`,
      totalRecalls: data.length,
    });

  } catch (error) {
    console.error("Error fetching or processing data:", error);
    return c.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});


// Add an endpoint to query the data
app.get("/recalls", async (c) => {
  try {
    const result = await db.execute({

      sql: "SELECT * FROM enforcements WHERE source_api = ? LIMIT 100",
      args: ["fsis"],
    }
    );
    return c.json(result.rows);
  } catch (error) {
    return c.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Add an endpoint to get a specific recall by ID
app.get("/recalls/:recallNumber", async (c) => {
  const recallNumber = c.req.param("recallNumber");

  try {
    const result = await db.execute({
      sql: "SELECT * FROM enforcements WHERE recall_number = ? AND source_api = ? LIMIT 1",
      args: [recallNumber, "fsis"],
    });

    if (result.rows.length === 0) {
      return c.json({ status: "error", message: "Recall not found" }, 404);
    }

    return c.json(result.rows[0]);
  } catch (error) {
    return c.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Start the server
const port = process.env.PORT || 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port: Number(port),
});
