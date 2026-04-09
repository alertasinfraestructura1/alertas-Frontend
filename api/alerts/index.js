const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient(process.env.COSMOSDB_CONNECTION_STRING);
const DATABASE_ID  = process.env.COSMOSDB_DATABASE_ID  || "Bancsito";
const CONTAINER_ID = process.env.COSMOSDB_CONTAINER_ID || "Alertas";

/**
 * GET /api/alerts
 * Query params:
 *   ?severity=critical|warning|informational
 *   ?resource=<nombre>
 *   ?search=<texto libre>
 *   ?assignedTo=<persona>
 */
module.exports = async function (context, req) {
  context.log("GET /api/alerts - iniciando consulta a Cosmos DB");

  const { severity, resource, search, assignedTo } = req.query;

  try {
    const container = client.database(DATABASE_ID).container(CONTAINER_ID);

    // Construir query dinámica
    let query  = "SELECT c.id, c.alertId, c.severity, c.category, c.resource, c.resourceType, c.description, c.assignedTo, c.suggestion, c.createdAt, c.status FROM c";
    const params = [];
    const conditions = [];

    // Solo alertas activas (sin estado "resolved")
    conditions.push("(NOT IS_DEFINED(c.status) OR c.status != 'resolved')");

    if (severity) {
      conditions.push("LOWER(c.severity) = @severity");
      params.push({ name: "@severity", value: severity.toLowerCase() });
    }

    if (resource) {
      conditions.push("CONTAINS(LOWER(c.resource), @resource)");
      params.push({ name: "@resource", value: resource.toLowerCase() });
    }

    if (assignedTo) {
      conditions.push("CONTAINS(LOWER(c.assignedTo), @assignedTo)");
      params.push({ name: "@assignedTo", value: assignedTo.toLowerCase() });
    }

    if (search) {
      conditions.push(
        "(CONTAINS(LOWER(c.alertId), @search) OR CONTAINS(LOWER(c.resource), @search) OR CONTAINS(LOWER(c.description), @search) OR CONTAINS(LOWER(c.assignedTo), @search))"
      );
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

    // Normalizar campos para el frontend
    const normalized = alerts.map(a => ({
      alertId:      a.alertId || a.id,
      severity:     a.severity || a.category || "Informational",
      resource:     a.resource || a.resourceName || "",
      resourceType: a.resourceType || "",
      description:  a.description || "",
      assignedTo:   a.assignedTo || "",
      suggestion:   a.suggestion || a.sugerencia || "",
      createdAt:    a.createdAt || null,
      status:       a.status || "active",
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
