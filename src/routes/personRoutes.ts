import { Router } from "express";
import {
  createPerson,
  getPersons,
  addWeeklyReport,
  getAllReports,
  getReportsByPersonId,
  getPeopleByUserAdmin,
  getUsersWithPeopleRecords,
} from "../controllers/personController";
import { authenticateToken, isAdmin } from "../middleware/authMiddleware";

const router = Router();

// Routes for Persons
// POST /api/persons - Create a new person
router.post("/", authenticateToken, createPerson);

// GET /api/persons - Get all persons (filtered by user/admin role in controller)
router.get("/", authenticateToken, getPersons);

// Routes for Weekly Reports
// POST /api/persons/:personId/report - Add a report for a specific person
router.post("/:personId/report", authenticateToken, addWeeklyReport);
router.get("/:personId/", authenticateToken, getReportsByPersonId);

// GET /api/persons/reports/all - Admin only: Get all weekly reports
router.get("/reports/all", authenticateToken, isAdmin, getAllReports);
router.get(
  "/admin/users/list",
  authenticateToken,
  isAdmin,
  getUsersWithPeopleRecords
);
router.get(
  "/admin/users/:userId",
  authenticateToken,
  isAdmin,
  getPeopleByUserAdmin
);

export default router;
