const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient(process.env.COSMOSDB_CONNECTION_STRING);
const DATABASE_ID  = process.env.COSMOSDB_DATABASE_ID  || "Bancsito";
const CONTAINER_ID = process.env.COSMOSDB_CONTAINER_ID || "Alertas";

module.exports = async function (context, req) {
  context.log("GET /api/alerts - iniciando consulta a Cosmos DB");

  const { severity, search } = req.query;

  try {
    const container = client.database(DATABASE_ID).container(CONTAINER_ID);

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
        CONTAINS(LOWER(c.alertName),  @search) OR
        CONTAINS(LOWER(c.environment),@search)
      )`);
      params.push({ name: "@search", value: search.toLowerCase() });
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY c._ts DESC";

    const { resources: alerts } = await container.items.query({
      query,
      parameters: params,
    }).fetchAll();

    const normalized = alerts.map(a => ({
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
    }));

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
    context.log.error("Error