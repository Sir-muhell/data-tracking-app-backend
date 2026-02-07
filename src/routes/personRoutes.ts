import { Router } from "express";
import {
  createPerson,
  getPersons,
  getPersonById,
  updatePerson,
  deletePerson,
  addWeeklyReport,
  updateWeeklyReport,
  deleteWeeklyReport,
  getAllReports,
  getReportsByPersonId,
  getPeopleByUserAdmin,
  getUsersWithPeopleRecords,
  getUserStatistics,
  getAdminStatistics,
} from "../controllers/personController";
import { authenticateToken, isAdmin } from "../middleware/authMiddleware";

const router = Router();

/**
 * @swagger
 * /api/persons:
 *   post:
 *     summary: Create a new person
 *     tags: [Persons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Person'
 *     responses:
 *       201:
 *         description: Person created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post("/", authenticateToken, createPerson);

/**
 * @swagger
 * /api/persons:
 *   get:
 *     summary: Get all persons (paginated)
 *     tags: [Persons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: List of persons
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Person'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get("/", authenticateToken, getPersons);

/**
 * @swagger
 * /api/persons/{personId}/reports:
 *   get:
 *     summary: Get all reports for a person (paginated)
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: personId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of reports for the person
 */
router.get("/:personId/reports", authenticateToken, getReportsByPersonId);

/**
 * @swagger
 * /api/persons/{id}:
 *   get:
 *     summary: Get a person by ID
 *     tags: [Persons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Person details
 *       404:
 *         description: Person not found
 */
router.get("/:id", authenticateToken, getPersonById);

/**
 * @swagger
 * /api/persons/{id}:
 *   put:
 *     summary: Update a person
 *     tags: [Persons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Person'
 *     responses:
 *       200:
 *         description: Person updated successfully
 *       404:
 *         description: Person not found
 */
router.put("/:id", authenticateToken, updatePerson);

/**
 * @swagger
 * /api/persons/{id}:
 *   delete:
 *     summary: Delete a person and all associated reports
 *     tags: [Persons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Person deleted successfully
 *       404:
 *         description: Person not found
 */
router.delete("/:id", authenticateToken, deletePerson);

/**
 * @swagger
 * /api/persons/{personId}/report:
 *   post:
 *     summary: Add a weekly report for a person
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: personId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WeeklyReport'
 *     responses:
 *       201:
 *         description: Report created successfully
 */
router.post("/:personId/report", authenticateToken, addWeeklyReport);

/**
 * @swagger
 * /api/persons/{personId}/report/{reportId}:
 *   put:
 *     summary: Update a weekly report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: personId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WeeklyReport'
 *     responses:
 *       200:
 *         description: Report updated successfully
 */
router.put("/:personId/report/:reportId", authenticateToken, updateWeeklyReport);

/**
 * @swagger
 * /api/persons/{personId}/report/{reportId}:
 *   delete:
 *     summary: Delete a weekly report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: personId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report deleted successfully
 */
router.delete("/:personId/report/:reportId", authenticateToken, deleteWeeklyReport);


/**
 * @swagger
 * /api/persons/reports/all:
 *   get:
 *     summary: Get all reports (admin only, paginated)
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of all reports
 *       403:
 *         description: Admin access required
 */
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
router.get(
  "/admin/users/:userId/statistics",
  authenticateToken,
  isAdmin,
  getUserStatistics
);
router.get(
  "/admin/statistics",
  authenticateToken,
  isAdmin,
  getAdminStatistics
);

export default router;
