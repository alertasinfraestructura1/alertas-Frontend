const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient(process.env.COSMOSDB_CONNECTION_STRING);
const DATABASE_ID  = process.env.COSMOSDB_DATABASE_ID  || "Bancsito";
const CONTAINER_ID = process.env.COSMOSDB_CONTAINER_ID || "Alertas";
const AI_CONTAINER_ID = "AiUpdate";

module.exports = async function (context, req) {
  context.log("GET /api/alerts - iniciando consulta a Cosmos DB");

  const { severity, search } = req.query;

  try {
    const alertsContainer = client.database(DATABASE_ID).container(CONTAINER_ID);
    const aiContainer     = client.database(DATABASE_ID).container(AI_CONTAINER_ID);

    // ── 1. Query alertas ──────────────────────
    let query = `SELECT c.idAlert, c.resourceId, c.resourceType, c.environment,
                        c.alertName, c.category, c.severity, c.status,
                        c.message, c.metricValue, c.createdAt
                 FROM c`;

    const params = [];
    const conditions = [];

    conditions.push("(NOT IS_DEFINED(c.status) OR c.status != 'Closed')");

    if (severity) {
      conditions.push("LOWER(c.severity) = @severity");
      params.push({ name: "@severity", value: severity.toLowerCase() });
    }

    if (search) {
      conditions.push(`(
        CONTAINS(LOWER(c.idAlert),    @search) OR
        CONTAINS(LOWER(c.resourceId), @search) OR
        CONTAINS(LOWER(c.message),    @search) OR
        CONTAINS(LOWER(c.alertName),  @search)
      )`);
      params.push({ name: "@search", value: search.toLowerCase() });
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY c.createdAt DESC";

    const { resources: alerts } = await alertsContainer.items.query({
      query,
      parameters: params,
    }).fetchAll();

    // ── 2. Query AiUpdate ─────────────────────
    const { resources: aiUpdates } = await aiContainer.items.query(
      "SELECT c.idAlert, c.assignedTo, c.aiSuggestion FROM c"
    ).fetchAll();

    context.log('AI UPDATES count:', aiUpdates.length);
    context.log('AI UPDATES sample:', JSON.stringify(aiUpdates.slice(0, 2)));

    // ── 3. Crear mapa idAlert → aiUpdate ──────
    const aiMap = {};
    aiUpdates.forEach(ai => {
      aiMap[ai.idAlert] = ai;
    });

    // ── 4. Combinar — solo alertas que tienen AiUpdate ────
    const normalized = alerts
      .filter(a => aiMap[a.idAlert])
      .map(a => ({
        idAlert:      a.idAlert      || "",
        resourceId:   a.resourceId   || "",
        resourceType: a.resourceType || "",
        environment:  a.environment  || "",
        alertName:    a.alertName    || "",
        category:     a.category     || "",
        severity:     a.severity     || "Informational",
        status:       a.status       || "Open",
        message:      a.message      || "",
        metricValue:  a.metricValue  ?? null,
        createdAt:    a.createdAt    || null,
        assignedTo:   aiMap[a.idAlert].assignedTo   || "",
        aiSuggestion: aiMap[a.idAlert].aiSuggestion || "",
      }))
       .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({ alerts: normalized, count: normalized.length }),
    };

  } catch (error) {
    context.log.error("Error consultando Cosmos DB:", error.message);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Error al consultar la base de datos",
        detail: error.message,
      }),
    };
  }
};