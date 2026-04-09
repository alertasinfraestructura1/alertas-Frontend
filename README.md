# 🔔 Azure Alerts Dashboard

Dashboard de monitoreo de alertas construido con Azure Static Web Apps + Azure Functions + Cosmos DB.

## Estructura del proyecto

```
azure-alerts-dashboard/
├── src/
│   └── index.html              # Frontend (HTML + CSS + JS puro)
├── api/
│   ├── alerts/
│   │   ├── index.js            # Azure Function GET /api/alerts
│   │   └── function.json       # Binding HTTP trigger
│   ├── package.json
│   └── host.json
├── staticwebapp.config.json    # Rutas y headers SWA
└── .github/workflows/
    └── azure-static-web-apps.yml
```

## Esquema esperado en Cosmos DB

Cada documento en el container `Alerts` debe tener esta forma:

```json
{
  "id": "uuid-unico",
  "alertId": "ALT-0001",
  "severity": "Critical",
  "resource": "vm-prod-01",
  "resourceType": "Virtual Machine",
  "description": "CPU por encima del 95%",
  "assignedTo": "Carlos Pérez",
  "suggestion": "Escalar verticalmente la VM...",
  "status": "active",
  "createdAt": "2025-01-15T10:30:00Z"
}
```

**Valores válidos para `severity`:** `Critical`, `Warning`, `Informational`  
**Valores válidos para `status`:** `active`, `resolved` (las resueltas no se muestran)

## Configuración

### 1. Variables de entorno en Azure Static Web Apps

En el portal de Azure → Static Web App → Configuration → Application settings:

| Variable | Descripción |
|---|---|
| `COSMOSDB_CONNECTION_STRING` | Cadena de conexión de Cosmos DB |
| `COSMOSDB_DATABASE_ID` | Nombre de la base de datos (ej: `AlertsDB`) |
| `COSMOSDB_CONTAINER_ID` | Nombre del container (ej: `Alerts`) |

### 2. Cosmos DB - Partition key recomendada

Usar `/severity` como partition key para optimizar las queries por severidad, o `/resource` si las consultas suelen filtrar por recurso.

### 3. Deploy

#### Opción A: GitHub Actions (recomendado)
1. Crear el Static Web App en Azure Portal
2. Vincular con el repositorio GitHub
3. Agregar `AZURE_STATIC_WEB_APPS_API_TOKEN` en los secrets del repo
4. Push a `main` → deploy automático

#### Opción B: Azure CLI
```bash
az staticwebapp create \
  --name alerts-dashboard \
  --resource-group mi-rg \
  --source https://github.com/org/repo \
  --location "East US 2" \
  --branch main \
  --app-location "/src" \
  --api-location "/api" \
  --output-location ""
```

## API Endpoints

### GET /api/alerts

Retorna todas las alertas activas.

**Query params opcionales:**
- `?severity=critical` — filtrar por severidad
- `?resource=vm-prod` — filtrar por recurso (substring)
- `?search=cpu` — búsqueda libre
- `?assignedTo=carlos` — filtrar por asignado

**Respuesta:**
```json
{
  "alerts": [...],
  "count": 42
}
```

## Desarrollo local

```bash
# Instalar Azure Functions Core Tools
npm install -g azure-functions-core-tools@4

# Instalar dependencias de la API
cd api && npm install

# Crear archivo de config local
cp api/local.settings.json.example api/local.settings.json
# Editar con tus valores de Cosmos DB

# Iniciar la función localmente
cd api && func start

# Abrir src/index.html en el browser
# (o usar Live Server en VS Code)
```

### local.settings.json (no commitear)
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "COSMOSDB_CONNECTION_STRING": "AccountEndpoint=https://...;AccountKey=...",
    "COSMOSDB_DATABASE_ID": "AlertsDB",
    "COSMOSDB_CONTAINER_ID": "Alerts"
  }
}
```
