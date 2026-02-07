import swaggerJsdoc from "swagger-jsdoc";
import { SwaggerDefinition } from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Follow-Up API",
      version: "1.0.0",
      description: "API documentation for the Follow-Up contact tracking application",
      contact: {
        name: "API Support",
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || "http://localhost:5001/api",
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        Person: {
          type: "object",
          properties: {
            _id: { type: "string" },
            name: { type: "string", example: "John Doe" },
            phone: { type: "string", example: "(555) 123-4567" },
            address: { type: "string", example: "123 Main St" },
            inviter: { type: "string", example: "Jane Smith" },
            notes: { type: "string", example: "Met at conference" },
            createdBy: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        WeeklyReport: {
          type: "object",
          properties: {
            _id: { type: "string" },
            person: { type: "string" },
            contacted: { type: "boolean" },
            response: { type: "string" },
            weekOf: { type: "string", format: "date" },
            reportedBy: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
        },
        Pagination: {
          type: "object",
          properties: {
            page: { type: "number" },
            limit: { type: "number" },
            total: { type: "number" },
            totalPages: { type: "number" },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.ts", "./src/controllers/*.ts"],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
