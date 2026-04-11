import { Response } from "express";
import mongoose from "mongoose";
import Person, { IPerson } from "../models/Persons";
import WeeklyReport from "../models/WeeklyReports";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  personSchema,
  weeklyReportSchema,
  reassignContactSchema,
} from "../validation/personValidation";
import Users from "../models/Users";
import logger from "../utils/logger";
import { LEADERSHIP_QUARTERLY_REPORT_ADMIN_EMAIL } from "../config/leadershipReport";

const NOT_ARCHIVED = { archived: { $ne: true } };

export const createPerson = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const { error, value } = personSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  const { name, phone, address, inviter, notes } = value;

  try {
    const newPerson: IPerson = new Person({
      name,
      phone,
      address,
      inviter,
      notes,
      createdBy: req.userId,
    });

    await newPerson.save();
    logger.info("Person created", {
      personId: newPerson._id,
      userId: req.userId,
    });
    res.status(201).json(newPerson);
  } catch (err: any) {
    logger.error("Error creating person", {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    res.status(500).json({ message: "Server error: Could not create person." });
  }
};

export const getPersons = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const sortBy = (req.query.sortBy as string) || "createdAt";
    const sortOrder = (req.query.sortOrder as string) === "asc" ? 1 : -1;

    const skip = (page - 1) * limit;
    const sort: any = { [sortBy]: sortOrder };

    const includeArchived =
      req.query.includeArchived === "true" && req.role === "admin";
    const archiveFilter = includeArchived ? {} : NOT_ARCHIVED;
    // Everyone (including admins) sees only their own contacts on the main dashboard
    const query = { createdBy: req.userId, ...archiveFilter };
    const countQuery = { createdBy: req.userId, ...archiveFilter };

    const total = await Person.countDocuments(countQuery);
    const persons = await Person.find(query)
      .populate("createdBy", "username")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const personIds = persons.map((p: any) => p._id);
    const reportCounts = await WeeklyReport.aggregate([
      { $match: { person: { $in: personIds } } },
      { $group: { _id: "$person", count: { $sum: 1 } } },
    ]);
    const countByPersonId = new Map<string, number>();
    for (const row of reportCounts) {
      countByPersonId.set(row._id.toString(), row.count);
    }
    const personsWithCount = persons.map((p: any) => ({
      ...p,
      reportCount: countByPersonId.get(p._id.toString()) ?? 0,
    }));

    const totalPages = Math.ceil(total / limit);

    logger.debug("Persons fetched", {
      count: persons.length,
      total,
      page,
      userId: req.userId,
      role: req.role,
    });
    res.json({
      data: personsWithCount,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err: any) {
    logger.error("Error fetching persons", {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    res.status(500).json({ message: "Server error: Could not fetch persons." });
  }
};

export const addWeeklyReport = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const personId = req.params.personId;

  const { error, value } = weeklyReportSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  const { contacted, response, weekOf, attendedService } = value;

  try {
    const person = await Person.findOne({
      _id: personId,
      createdBy: req.userId,
      ...NOT_ARCHIVED,
    });

    if (!person) {
      return res
        .status(404)
        .json({ message: "Person not found or unauthorized." });
    }

    const newReport = new WeeklyReport({
      person: personId,
      contacted,
      response,
      weekOf,
      attendedService: attendedService ?? false,
      reportedBy: req.userId,
    });

    await newReport.save();
    logger.info("Weekly report added", {
      reportId: newReport._id,
      personId,
      userId: req.userId,
    });
    res.status(201).json(newReport);
  } catch (err: any) {
    logger.error("Error adding weekly report", {
      error: err.message,
      stack: err.stack,
      personId,
      userId: req.userId,
    });
    res.status(500).json({ message: "Server error: Could not add report." });
  }
};

export const getAllReports = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const sortBy = (req.query.sortBy as string) || "weekOf";
    const sortOrder = (req.query.sortOrder as string) === "asc" ? 1 : -1;

    const skip = (page - 1) * limit;
    const sort: any = { [sortBy]: sortOrder };

    const total = await WeeklyReport.countDocuments();
    const reports = await WeeklyReport.find()
      .populate("person", "name phone createdBy")
      .populate("reportedBy", "username")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    logger.debug("All reports fetched", {
      count: reports.length,
      total,
      page,
      userId: req.userId,
    });
    res.json({
      data: reports,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err: any) {
    logger.error("Error fetching all reports", {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    res
      .status(500)
      .json({ message: "Server error: Could not fetch all reports." });
  }
};

export const getReportsByPersonId = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const { personId } = req.params;

  try {
    const person =
      req.role === "admin"
        ? await Person.findById(personId)
        : await Person.findOne({ _id: personId, createdBy: req.userId });

    if (!person) {
      return res.status(404).json({
        message: "Person not found or unauthorized to access this person.",
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const sortBy = (req.query.sortBy as string) || "weekOf";
    const sortOrder = (req.query.sortOrder as string) === "asc" ? 1 : -1;

    const skip = (page - 1) * limit;
    const sort: any = { [sortBy]: sortOrder, createdAt: -1 };

    // Convert personId to ObjectId for proper querying
    const personObjectId = new mongoose.Types.ObjectId(personId);

    const total = await WeeklyReport.countDocuments({ person: personObjectId });
    const reports = await WeeklyReport.find({
      person: personObjectId,
    })
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    logger.debug("Reports fetched for person", {
      personId,
      count: reports.length,
      total,
      page,
      userId: req.userId,
      personName: person.name,
    });

    res.json({
      personName: person.name,
      reports,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err: any) {
    logger.error("Error fetching reports by person", {
      error: err.message,
      stack: err.stack,
      personId,
      userId: req.userId,
    });
    res.status(500).json({ message: "Server error: Could not fetch reports." });
  }
};

export const getUsersWithPeopleRecords = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const users = await Users.find().select("_id username role").exec();
    logger.debug("Users with records fetched", {
      count: users.length,
      userId: req.userId,
    });
    res.status(200).json(users);
  } catch (err: any) {
    logger.error("Error fetching users", {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    res.status(500).json({ message: "Server error: Could not fetch users." });
  }
};

export const getPeopleByUserAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const { userId } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid User ID format." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const sortBy = (req.query.sortBy as string) || "createdAt";
    const sortOrder = (req.query.sortOrder as string) === "asc" ? 1 : -1;

    const skip = (page - 1) * limit;
    const sort: any = { [sortBy]: sortOrder };

    const includeArchived = req.query.includeArchived === "true";
    const personQuery = {
      createdBy: userId,
      ...(includeArchived ? {} : NOT_ARCHIVED),
    };

    const total = await Person.countDocuments(personQuery);
    const people = await Person.find(personQuery)
      .select("-__v -createdBy")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .exec();

    const totalPages = Math.ceil(total / limit);

    logger.debug("People fetched for user", {
      targetUserId: userId,
      count: people.length,
      total,
      page,
      adminUserId: req.userId,
    });

    res.status(200).json({
      data: people,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err: any) {
    logger.error("Error fetching people by user", {
      error: err.message,
      stack: err.stack,
      targetUserId: userId,
      adminUserId: req.userId,
    });
    res
      .status(500)
      .json({ message: "Server error: Could not fetch people records." });
  }
};

type BatchOverviewResult =
  | { ok: true; items: { person: unknown; reports: unknown[] }[] }
  | { ok: false; status: number; message: string };

async function resolveBatchOverview(
  targetUserId: string,
  personIdsRaw: string | undefined,
): Promise<BatchOverviewResult> {
  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    return { ok: false, status: 400, message: "Invalid User ID format." };
  }

  if (!personIdsRaw || !personIdsRaw.trim()) {
    return {
      ok: false,
      status: 400,
      message:
        "personIds query parameter is required (comma-separated IDs).",
    };
  }

  const personIdStrings = [
    ...new Set(
      personIdsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  const personObjectIds: mongoose.Types.ObjectId[] = [];
  for (const id of personIdStrings) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return { ok: false, status: 400, message: `Invalid person ID: ${id}` };
    }
    personObjectIds.push(new mongoose.Types.ObjectId(id));
  }

  if (personObjectIds.length === 0) {
    return {
      ok: false,
      status: 400,
      message: "At least one valid person ID is required.",
    };
  }

  const persons = await Person.find({
    _id: { $in: personObjectIds },
    createdBy: targetUserId,
  })
    .select("-__v")
    .lean();

  if (persons.length !== personObjectIds.length) {
    return {
      ok: false,
      status: 404,
      message:
        "One or more contacts were not found or do not belong to this user.",
    };
  }

  const reports = await WeeklyReport.find({
    person: { $in: personObjectIds },
  })
    .sort({ weekOf: -1, createdAt: -1 })
    .populate("reportedBy", "username")
    .lean();

  const reportsByPerson = new Map<string, any[]>();
  for (const r of reports) {
    const pid = (r as any).person?.toString?.() ?? String((r as any).person);
    if (!reportsByPerson.has(pid)) reportsByPerson.set(pid, []);
    reportsByPerson.get(pid)!.push(r);
  }

  const order = new Map(personIdStrings.map((id, i) => [id, i]));
  persons.sort(
    (a: any, b: any) =>
      (order.get(a._id.toString()) ?? 0) - (order.get(b._id.toString()) ?? 0),
  );

  const items = persons.map((p: any) => ({
    person: p,
    reports: reportsByPerson.get(p._id.toString()) ?? [],
  }));

  return { ok: true, items };
}

/**
 * Current user: batch overview for their own contacts (same payload as admin route).
 */
export const getBatchOverviewForCurrentUser = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const personIdsRaw = req.query.personIds as string | undefined;

  try {
    const result = await resolveBatchOverview(req.userId!, personIdsRaw);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    logger.debug("Batch overview fetched (current user)", {
      contactCount: result.items.length,
      userId: req.userId,
    });

    res.status(200).json({ items: result.items });
  } catch (err: any) {
    logger.error("Error fetching batch overview", {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    res
      .status(500)
      .json({ message: "Server error: Could not fetch batch overview." });
  }
};

/**
 * Admin: for a list of person IDs (contacts of a user), return each contact with all their weekly reports.
 */
export const getBatchOverviewForAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }

  const { userId } = req.params;
  const personIdsRaw = req.query.personIds as string | undefined;

  try {
    const result = await resolveBatchOverview(userId, personIdsRaw);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    logger.debug("Batch overview fetched", {
      targetUserId: userId,
      contactCount: result.items.length,
      adminUserId: req.userId,
    });

    res.status(200).json({ items: result.items });
  } catch (err: any) {
    logger.error("Error fetching batch overview", {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    res
      .status(500)
      .json({ message: "Server error: Could not fetch batch overview." });
  }
};

export const getUserStatistics = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const { userId } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid User ID format." });
    }

    const user = await Users.findById(userId).select("username");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const totalContacts = await Person.countDocuments({
      createdBy: userId,
      ...NOT_ARCHIVED,
    });

    // Only count reports where the person still exists and is not archived
    const validPersons = (await Person.find({
      createdBy: userId,
      ...NOT_ARCHIVED,
    })
      .select("_id createdAt")
      .lean()) as unknown as Array<{
      _id: mongoose.Types.ObjectId;
      createdAt: Date;
    }>;
    const validPersonIds = validPersons.map((p) => p._id);
    const totalReports = await WeeklyReport.countDocuments({
      reportedBy: userId,
      person: { $in: validPersonIds },
    });

    // Helper function to get Monday of a week
    const getMondayOfWeek = (date: Date): Date => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      monday.setHours(0, 0, 0, 0);
      return monday;
    };

    // Helper function to get all weeks between two dates
    const getWeeksBetween = (startDate: Date, endDate: Date): Date[] => {
      const weeks: Date[] = [];
      const start = getMondayOfWeek(startDate);
      const end = getMondayOfWeek(endDate);
      const current = new Date(start);

      while (current <= end) {
        weeks.push(new Date(current));
        current.setDate(current.getDate() + 7);
      }
      return weeks;
    };

    // Get current week (Monday)
    const now = new Date();
    const currentWeek = getMondayOfWeek(now);

    // Calculate expected weeks for all contacts
    let totalExpectedReports = 0;
    const weekReportMap = new Map<
      string,
      { expected: number; actual: number }
    >();

    for (const person of validPersons) {
      const personCreatedAt = new Date(person.createdAt);
      const personStartWeek = getMondayOfWeek(personCreatedAt);
      const expectedWeeks = getWeeksBetween(personStartWeek, currentWeek);

      totalExpectedReports += expectedWeeks.length;

      // Track expected reports per week
      for (const week of expectedWeeks) {
        const weekKey = week.toISOString().split("T")[0];
        if (!weekReportMap.has(weekKey)) {
          weekReportMap.set(weekKey, { expected: 0, actual: 0 });
        }
        const stats = weekReportMap.get(weekKey)!;
        stats.expected += 1;
      }
    }

    // Get actual reports grouped by week
    const actualReports = await WeeklyReport.find({
      reportedBy: userId,
      person: { $in: validPersonIds },
    })
      .select("weekOf person")
      .lean();

    for (const report of actualReports) {
      const weekOf = new Date(report.weekOf);
      const weekKey = getMondayOfWeek(weekOf).toISOString().split("T")[0];
      if (weekReportMap.has(weekKey)) {
        const stats = weekReportMap.get(weekKey)!;
        stats.actual += 1;
      }
    }

    // Calculate per-week statistics
    const weekStats: Array<{
      week: string;
      expected: number;
      actual: number;
      missing: number;
      completionRate: string;
    }> = [];
    let totalActualReports = 0;
    let totalMissingReports = 0;

    for (const [weekKey, stats] of weekReportMap.entries()) {
      const missing = stats.expected - stats.actual;
      const completionRate =
        stats.expected > 0
          ? ((stats.actual / stats.expected) * 100).toFixed(1)
          : "0";

      weekStats.push({
        week: weekKey,
        expected: stats.expected,
        actual: stats.actual,
        missing,
        completionRate,
      });

      totalActualReports += stats.actual;
      totalMissingReports += missing;
    }

    // Sort by week (newest first)
    weekStats.sort(
      (a, b) => new Date(b.week).getTime() - new Date(a.week).getTime(),
    );

    // Calculate overall completion rate
    const reportCompletionRate =
      totalExpectedReports > 0
        ? ((totalActualReports / totalExpectedReports) * 100).toFixed(1)
        : "0";

    // Get recent reports
    const recentReports = await WeeklyReport.find({
      reportedBy: userId,
      person: { $in: validPersonIds },
    })
      .sort({ weekOf: -1, createdAt: -1 })
      .limit(10)
      .populate("person", "name")
      .select("weekOf contacted attendedService person createdAt")
      .lean();

    // Attendance statistics
    const totalAttendances = await WeeklyReport.countDocuments({
      reportedBy: userId,
      person: { $in: validPersonIds },
      attendedService: true,
    });
    const contactsWithAttendance = await WeeklyReport.distinct("person", {
      reportedBy: userId,
      person: { $in: validPersonIds },
      attendedService: true,
    });

    // Check for orphaned reports (reports without valid persons)
    const orphanedReportsCount = await WeeklyReport.countDocuments({
      reportedBy: userId,
      person: { $nin: validPersonIds },
    });

    logger.debug("User statistics fetched", {
      targetUserId: userId,
      adminUserId: req.userId,
      orphanedReports: orphanedReportsCount,
    });

    const response: any = {
      user: {
        _id: user._id,
        username: user.username,
      },
      statistics: {
        totalContacts,
        totalReports,
        totalExpectedReports,
        totalActualReports,
        totalMissingReports,
        reportCompletionRate,
        weeksTracked: weekStats.length,
        totalAttendances,
        contactsWithAtLeastOneAttendance: contactsWithAttendance.length,
      },
      weekStats: weekStats.slice(0, 12), // Last 12 weeks
      recentReports: recentReports.map((r: any) => ({
        weekOf: r.weekOf,
        contacted: r.contacted,
        attendedService: r.attendedService,
        personName: r.person?.name || "Unknown",
        createdAt: r.createdAt,
      })),
    };

    if (orphanedReportsCount > 0) {
      response.warning = `Found ${orphanedReportsCount} orphaned report(s) (reports for deleted contacts). Run cleanup script to remove them.`;
      logger.warn("Orphaned reports detected", {
        userId,
        count: orphanedReportsCount,
      });
    }

    res.status(200).json(response);
  } catch (err: any) {
    logger.error("Error fetching user statistics", {
      error: err.message,
      stack: err.stack,
      targetUserId: userId,
      adminUserId: req.userId,
    });
    res
      .status(500)
      .json({ message: "Server error: Could not fetch user statistics." });
  }
};

export const getAdminStatistics = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const totalUsers = await Users.countDocuments();
    const totalContacts = await Person.countDocuments(NOT_ARCHIVED);

    // Only count reports where the person still exists and is not archived
    const validPersons = (await Person.find(NOT_ARCHIVED)
      .select("_id createdAt createdBy")
      .lean()) as unknown as Array<{
      _id: mongoose.Types.ObjectId;
      createdAt: Date;
      createdBy: mongoose.Types.ObjectId;
    }>;
    const validPersonIds = validPersons.map((p) => p._id);
    const totalReports = await WeeklyReport.countDocuments({
      person: { $in: validPersonIds },
    });

    // Helper function to get Monday of a week
    const getMondayOfWeek = (date: Date): Date => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      monday.setHours(0, 0, 0, 0);
      return monday;
    };

    // Helper function to get all weeks between two dates
    const getWeeksBetween = (startDate: Date, endDate: Date): Date[] => {
      const weeks: Date[] = [];
      const start = getMondayOfWeek(startDate);
      const end = getMondayOfWeek(endDate);
      const current = new Date(start);

      while (current <= end) {
        weeks.push(new Date(current));
        current.setDate(current.getDate() + 7);
      }
      return weeks;
    };

    // Get current week (Monday)
    const now = new Date();
    const currentWeek = getMondayOfWeek(now);

    // Calculate expected weeks for all contacts
    let totalExpectedReports = 0;
    const weekReportMap = new Map<
      string,
      { expected: number; actual: number }
    >();

    for (const person of validPersons) {
      const personCreatedAt = new Date(person.createdAt);
      const personStartWeek = getMondayOfWeek(personCreatedAt);
      const expectedWeeks = getWeeksBetween(personStartWeek, currentWeek);

      totalExpectedReports += expectedWeeks.length;

      // Track expected reports per week
      for (const week of expectedWeeks) {
        const weekKey = week.toISOString().split("T")[0];
        if (!weekReportMap.has(weekKey)) {
          weekReportMap.set(weekKey, { expected: 0, actual: 0 });
        }
        const stats = weekReportMap.get(weekKey)!;
        stats.expected += 1;
      }
    }

    // Get actual reports grouped by week
    const actualReports = await WeeklyReport.find({
      person: { $in: validPersonIds },
    })
      .select("weekOf person")
      .lean();

    let totalActualReports = 0;
    for (const report of actualReports) {
      const weekOf = new Date(report.weekOf);
      const weekKey = getMondayOfWeek(weekOf).toISOString().split("T")[0];
      if (weekReportMap.has(weekKey)) {
        const stats = weekReportMap.get(weekKey)!;
        stats.actual += 1;
        totalActualReports += 1;
      }
    }

    // Calculate per-week statistics
    const weekStats: Array<{
      week: string;
      expected: number;
      actual: number;
      missing: number;
      completionRate: string;
    }> = [];
    let totalMissingReports = 0;

    for (const [weekKey, stats] of weekReportMap.entries()) {
      const missing = stats.expected - stats.actual;
      const completionRate =
        stats.expected > 0
          ? ((stats.actual / stats.expected) * 100).toFixed(1)
          : "0";

      weekStats.push({
        week: weekKey,
        expected: stats.expected,
        actual: stats.actual,
        missing,
        completionRate,
      });

      totalMissingReports += missing;
    }

    // Sort by week (newest first)
    weekStats.sort(
      (a, b) => new Date(b.week).getTime() - new Date(a.week).getTime(),
    );

    // Calculate overall completion rate
    const reportCompletionRate =
      totalExpectedReports > 0
        ? ((totalActualReports / totalExpectedReports) * 100).toFixed(1)
        : "0";

    const usersWithContacts = await Person.distinct("createdBy", NOT_ARCHIVED);
    const activeUsersCount = usersWithContacts.length;

    // Get users with their report completion stats (per week)
    const usersWithReportStats = await Users.find({
      _id: { $in: usersWithContacts },
    })
      .select("username _id")
      .lean();

    const userReportStats = await Promise.all(
      usersWithReportStats.map(async (u: any) => {
        const userPersons = (await Person.find({
          createdBy: u._id,
          ...NOT_ARCHIVED,
        })
          .select("_id createdAt")
          .lean()) as unknown as Array<{
          _id: mongoose.Types.ObjectId;
          createdAt: Date;
        }>;
        const userPersonIds = userPersons.map((p) => p._id);
        const userTotalContacts = userPersonIds.length;

        // Calculate expected vs actual for this user
        let userExpected = 0;
        let userActual = 0;

        for (const person of userPersons) {
          const personCreatedAt = new Date(person.createdAt);
          const personStartWeek = getMondayOfWeek(personCreatedAt);
          const expectedWeeks = getWeeksBetween(personStartWeek, currentWeek);
          userExpected += expectedWeeks.length;
        }

        userActual = await WeeklyReport.countDocuments({
          reportedBy: u._id,
          person: { $in: userPersonIds },
        });

        const userCompletionRate =
          userExpected > 0
            ? ((userActual / userExpected) * 100).toFixed(1)
            : "0";

        return {
          userId: u._id.toString(),
          username: u.username,
          totalContacts: userTotalContacts,
          expectedReports: userExpected,
          actualReports: userActual,
          missingReports: userExpected - userActual,
          completionRate: userCompletionRate,
        };
      }),
    );

    const recentReports = await WeeklyReport.find({
      person: { $in: validPersonIds },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("person", "name")
      .populate("reportedBy", "username")
      .select("weekOf contacted person reportedBy createdAt")
      .lean();

    // Attendance statistics
    const totalAttendances = await WeeklyReport.countDocuments({
      person: { $in: validPersonIds },
      attendedService: true,
    });
    const contactsWithAttendance = await WeeklyReport.distinct("person", {
      person: { $in: validPersonIds },
      attendedService: true,
    });

    // Get unique weeks with reports
    const weeksWithReportsRaw = await WeeklyReport.distinct("weekOf", {
      person: { $in: validPersonIds },
    });
    const weeksWithReports = (weeksWithReportsRaw as Date[]).sort(
      (a: Date, b: Date) => b.getTime() - a.getTime(),
    );

    logger.debug("Admin statistics fetched", { userId: req.userId });
    res.status(200).json({
      statistics: {
        totalUsers,
        activeUsers: activeUsersCount,
        totalContacts,
        totalReports,
        totalExpectedReports,
        totalActualReports,
        totalMissingReports,
        reportCompletionRate,
        weeksTracked: weekStats.length,
        totalAttendances,
        contactsWithAtLeastOneAttendance: contactsWithAttendance.length,
      },
      weekStats: weekStats.slice(0, 12), // Last 12 weeks
      userReportStats,
      recentReports: recentReports.map((r: any) => ({
        weekOf: r.weekOf,
        contacted: r.contacted,
        attendedService: r.attendedService,
        personName: r.person?.name || "Unknown",
        reportedBy: r.reportedBy?.username || "Unknown",
        createdAt: r.createdAt,
      })),
    });
  } catch (err: any) {
    logger.error("Error fetching admin statistics", {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    res
      .status(500)
      .json({ message: "Server error: Could not fetch admin statistics." });
  }
};

function leadershipGetMondayOfWeek(date: Date): Date {
  const d = new Date(date.getTime());
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function leadershipWeeksBetween(startDate: Date, endDate: Date): Date[] {
  const weeks: Date[] = [];
  const start = leadershipGetMondayOfWeek(startDate);
  const end = leadershipGetMondayOfWeek(endDate);
  const current = new Date(start);
  while (current.getTime() <= end.getTime()) {
    weeks.push(new Date(current.getTime()));
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

function leadershipQuarterBounds(year: number, quarter: number): {
  quarterStart: Date;
  quarterEnd: Date;
} {
  const quarterStart = new Date(year, (quarter - 1) * 3, 1);
  quarterStart.setHours(0, 0, 0, 0);
  const quarterEnd = new Date(year, quarter * 3, 0);
  quarterEnd.setHours(23, 59, 59, 999);
  return { quarterStart, quarterEnd };
}

function leadershipFormatPlainText(payload: {
  period: { label: string; startDate: string; endDate: string };
  scorecard: Record<string, string | number>;
  byMonth: Array<{ monthLabel: string } & Record<string, string | number>>;
  methodology: string[];
}): string {
  const { period, scorecard, byMonth, methodology } = payload;
  const lines: string[] = [
    `Follow-up — ${period.label}`,
    `Reporting period: ${period.startDate} to ${period.endDate}`,
    "",
    "Executive summary",
    "Add 2–4 sentences here for leadership (outcomes, priorities, asks).",
    "",
    "Scorecard",
    `• Active contacts (non-archived, as of now): ${scorecard.activeContacts}`,
    `• New contacts added in ${period.label}: ${scorecard.newContactsInQuarter}`,
    `• Weekly reports filed: ${scorecard.weeklyReportsFiled} (${scorecard.followUpCompletionPercent}% of ${scorecard.expectedWeeklyReports} expected in-period)`,
    `• Reports marked as contacted: ${scorecard.reportsContactedYes} (${scorecard.reportsContactedPercent}% of reports filed this quarter)`,
    `• Service attendance (report rows): ${scorecard.attendanceYesTotal}; distinct people with ≥1 attendance: ${scorecard.distinctPeopleWithAttendance}`,
    "",
    "By month",
  ];
  for (const row of byMonth) {
    lines.push(
      `• ${row.monthLabel}: ${row.reportsFiled} reports filed; contacted ${row.contactedPercent}% of those rows; attendance ${row.attendanceYes} rows`,
    );
  }
  lines.push("", "Methodology", ...methodology.map((m) => `• ${m}`));
  return lines.join("\n");
}

/**
 * Admin-only; further restricted to LEADERSHIP_QUARTERLY_REPORT_ADMIN_EMAIL.
 */
export const getLeadershipQuarterlyReport = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }

  try {
    const adminUser = await Users.findById(req.userId)
      .select("email role")
      .lean();
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required." });
    }
    const email = (adminUser.email || "").trim().toLowerCase();
    if (email !== LEADERSHIP_QUARTERLY_REPORT_ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({
        message: "You do not have access to this report.",
      });
    }
  } catch (err: any) {
    logger.error("Leadership report access check failed", {
      error: err.message,
      userId: req.userId,
    });
    return res.status(500).json({ message: "Server error." });
  }

  const yearRaw = req.query.year as string | undefined;
  const quarterRaw = req.query.quarter as string | undefined;
  const format = (req.query.format as string) || "json";

  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultQuarter = Math.floor(now.getMonth() / 3) + 1;

  const year = yearRaw ? parseInt(yearRaw, 10) : defaultYear;
  const quarter = quarterRaw ? parseInt(quarterRaw, 10) : defaultQuarter;

  if (
    !Number.isFinite(year) ||
    year < 2000 ||
    year > 2100 ||
    !Number.isFinite(quarter) ||
    quarter < 1 ||
    quarter > 4
  ) {
    return res.status(400).json({
      message:
        "Invalid year or quarter. Use year=YYYY and quarter=1|2|3|4 (optional; defaults to current calendar quarter).",
    });
  }

  const { quarterStart, quarterEnd } = leadershipQuarterBounds(year, quarter);
  const periodLabel = `Q${quarter} ${year}`;
  const startDateStr = quarterStart.toISOString().split("T")[0];
  const endDateStr = quarterEnd.toISOString().split("T")[0];

  try {
    const validPersons = (await Person.find(NOT_ARCHIVED)
      .select("_id createdAt")
      .lean()) as unknown as Array<{
      _id: mongoose.Types.ObjectId;
      createdAt: Date;
    }>;
    const validPersonIds = validPersons.map((p) => p._id);

    const weeksInQuarter = leadershipWeeksBetween(quarterStart, quarterEnd);
    const weekKeySet = new Set(
      weeksInQuarter.map((w) => w.toISOString().split("T")[0]),
    );

    let expectedWeeklyReports = 0;
    for (const person of validPersons) {
      const personMonday = leadershipGetMondayOfWeek(
        new Date(person.createdAt),
      );
      for (const w of weeksInQuarter) {
        if (personMonday.getTime() <= w.getTime()) {
          expectedWeeklyReports += 1;
        }
      }
    }

    const reportsInQuarter = await WeeklyReport.find({
      weekOf: { $gte: quarterStart, $lte: quarterEnd },
      person: { $in: validPersonIds },
    })
      .select("weekOf contacted attendedService person reportedBy")
      .lean();

    let weeklyReportsFiled = 0;
    let reportsContactedYes = 0;
    let attendanceYesTotal = 0;
    const attendancePeople = new Set<string>();

    const monthBuckets: Record<
      string,
      { total: number; contactedYes: number; attendanceYes: number }
    > = {};

    for (const r of reportsInQuarter) {
      const wk = leadershipGetMondayOfWeek(new Date((r as any).weekOf));
      const key = wk.toISOString().split("T")[0];
      if (!weekKeySet.has(key)) continue;

      weeklyReportsFiled += 1;
      if ((r as any).contacted) {
        reportsContactedYes += 1;
      }
      if ((r as any).attendedService) {
        attendanceYesTotal += 1;
        attendancePeople.add((r as any).person.toString());
      }

      const d = new Date((r as any).weekOf);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthBuckets[monthKey]) {
        monthBuckets[monthKey] = {
          total: 0,
          contactedYes: 0,
          attendanceYes: 0,
        };
      }
      monthBuckets[monthKey].total += 1;
      if ((r as any).contacted) monthBuckets[monthKey].contactedYes += 1;
      if ((r as any).attendedService) {
        monthBuckets[monthKey].attendanceYes += 1;
      }
    }

    const followUpCompletionPercent =
      expectedWeeklyReports > 0
        ? ((weeklyReportsFiled / expectedWeeklyReports) * 100).toFixed(1)
        : "0";

    const reportsContactedPercent =
      weeklyReportsFiled > 0
        ? ((reportsContactedYes / weeklyReportsFiled) * 100).toFixed(1)
        : "0";

    const newContactsInQuarter = await Person.countDocuments({
      ...NOT_ARCHIVED,
      createdAt: { $gte: quarterStart, $lte: quarterEnd },
    });

    const activeContacts = validPersons.length;

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const byMonth = Object.keys(monthBuckets)
      .sort()
      .map((monthKey) => {
        const b = monthBuckets[monthKey];
        const contactedPercent =
          b.total > 0 ? ((b.contactedYes / b.total) * 100).toFixed(1) : "0";
        const [y, m] = monthKey.split("-").map(Number);
        const monthLabel = `${monthNames[m - 1]} ${y}`;
        return {
          monthKey,
          monthLabel,
          reportsFiled: b.total,
          contactedPercent,
          attendanceYes: b.attendanceYes,
        };
      });

    const byReporter = await WeeklyReport.aggregate([
      {
        $match: {
          weekOf: { $gte: quarterStart, $lte: quarterEnd },
          person: { $in: validPersonIds },
        },
      },
      { $group: { _id: "$reportedBy", weeklyReportsFiled: { $sum: 1 } } },
      { $sort: { weeklyReportsFiled: -1 } },
    ]);

    const reporterIds = byReporter.map((x) => x._id).filter(Boolean);
    const reporterUsers = await Users.find({ _id: { $in: reporterIds } })
      .select("username")
      .lean();
    const usernameById = new Map(
      reporterUsers.map((u: any) => [u._id.toString(), u.username]),
    );

    const userContributions = byReporter.map((row: any) => ({
      userId: row._id?.toString?.() ?? String(row._id),
      username: usernameById.get(row._id.toString()) ?? "Unknown",
      weeklyReportsFiled: row.weeklyReportsFiled,
    }));

    const methodology = [
      "Expected weekly reports = for each non-archived contact, one report per week (Monday boundary) from the contact’s first week through each week that overlaps the calendar quarter, same convention as the admin dashboard.",
      "Submitted reports counted here must fall on a week whose Monday is in that quarter and have week-of date within the quarter range.",
      "Archived contacts are excluded from expected counts and from report totals.",
      "Attendance is based on weekly report checkboxes, not a separate attendance system.",
    ];

    const scorecard = {
      activeContacts,
      newContactsInQuarter,
      weeklyReportsFiled,
      expectedWeeklyReports,
      followUpCompletionPercent,
      reportsContactedYes,
      reportsContactedPercent,
      attendanceYesTotal,
      distinctPeopleWithAttendance: attendancePeople.size,
    };

    const payload = {
      period: {
        label: periodLabel,
        startDate: startDateStr,
        endDate: endDateStr,
      },
      scorecard,
      byMonth,
      userContributions,
      methodology,
    };

    logger.debug("Leadership quarterly report generated", {
      userId: req.userId,
      periodLabel,
    });

    if (format === "text") {
      const text = leadershipFormatPlainText({
        period: payload.period,
        scorecard: scorecard as unknown as Record<string, string | number>,
        byMonth: byMonth as unknown as Array<
          { monthLabel: string } & Record<string, string | number>
        >,
        methodology,
      });
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.send(text);
    }

    res.status(200).json(payload);
  } catch (err: any) {
    logger.error("Error building leadership quarterly report", {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    res
      .status(500)
      .json({ message: "Server error: Could not build quarterly report." });
  }
};

export const getPersonById = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const { id } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Person ID format." });
    }

    const person =
      req.role === "admin"
        ? await Person.findById(id)
        : await Person.findOne({ _id: id, createdBy: req.userId });

    if (!person) {
      return res
        .status(404)
        .json({ message: "Person not found or unauthorized." });
    }

    logger.debug("Person fetched by ID", { personId: id, userId: req.userId });
    res.json(person);
  } catch (err: any) {
    logger.error("Error fetching person by ID", {
      error: err.message,
      stack: err.stack,
      personId: id,
      userId: req.userId,
    });
    res.status(500).json({ message: "Server error: Could not fetch person." });
  }
};

export const updatePerson = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const { id } = req.params;

  const { error, value } = personSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Person ID format." });
    }

    const person =
      req.role === "admin"
        ? await Person.findById(id)
        : await Person.findOne({ _id: id, createdBy: req.userId });

    if (!person) {
      return res
        .status(404)
        .json({ message: "Person not found or unauthorized." });
    }

    const { name, phone, address, inviter, notes } = value;
    person.name = name;
    person.phone = phone;
    person.address = address;
    person.inviter = inviter;
    person.notes = notes;

    await person.save();
    logger.info("Person updated", { personId: id, userId: req.userId });
    res.json(person);
  } catch (err: any) {
    logger.error("Error updating person", {
      error: err.message,
      stack: err.stack,
      personId: id,
      userId: req.userId,
    });
    res.status(500).json({ message: "Server error: Could not update person." });
  }
};

export const deletePerson = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const { id } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Person ID format." });
    }

    const person =
      req.role === "admin"
        ? await Person.findById(id)
        : await Person.findOne({ _id: id, createdBy: req.userId });

    if (!person) {
      return res
        .status(404)
        .json({ message: "Person not found or unauthorized." });
    }

    await WeeklyReport.deleteMany({ person: id });
    await Person.findByIdAndDelete(id);

    logger.info("Person deleted", { personId: id, userId: req.userId });
    res.json({
      message: "Person and associated reports deleted successfully.",
    });
  } catch (err: any) {
    logger.error("Error deleting person", {
      error: err.message,
      stack: err.stack,
      personId: id,
      userId: req.userId,
    });
    res.status(500).json({ message: "Server error: Could not delete person." });
  }
};

export const updateWeeklyReport = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const { personId, reportId } = req.params;

  const { error, value } = weeklyReportSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  try {
    if (
      !mongoose.Types.ObjectId.isValid(personId) ||
      !mongoose.Types.ObjectId.isValid(reportId)
    ) {
      return res.status(400).json({ message: "Invalid ID format." });
    }

    const person =
      req.role === "admin"
        ? await Person.findOne({ _id: personId, ...NOT_ARCHIVED })
        : await Person.findOne({
            _id: personId,
            createdBy: req.userId,
            ...NOT_ARCHIVED,
          });

    if (!person) {
      return res
        .status(404)
        .json({ message: "Person not found or unauthorized." });
    }

    const report =
      req.role === "admin"
        ? await WeeklyReport.findOne({ _id: reportId, person: personId })
        : await WeeklyReport.findOne({
            _id: reportId,
            person: personId,
            reportedBy: req.userId,
          });

    if (!report) {
      return res
        .status(404)
        .json({ message: "Report not found or unauthorized." });
    }

    const { contacted, response, weekOf, attendedService } = value;
    report.contacted = contacted;
    report.response = response;
    report.weekOf = weekOf;
    if (typeof attendedService === "boolean")
      report.attendedService = attendedService;

    await report.save();
    logger.info("Weekly report updated", {
      reportId,
      personId,
      userId: req.userId,
    });
    res.json(report);
  } catch (err: any) {
    logger.error("Error updating weekly report", {
      error: err.message,
      stack: err.stack,
      reportId,
      personId,
      userId: req.userId,
    });
    res.status(500).json({ message: "Server error: Could not update report." });
  }
};

export const deleteWeeklyReport = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const { personId, reportId } = req.params;

  try {
    if (
      !mongoose.Types.ObjectId.isValid(personId) ||
      !mongoose.Types.ObjectId.isValid(reportId)
    ) {
      return res.status(400).json({ message: "Invalid ID format." });
    }

    const person =
      req.role === "admin"
        ? await Person.findOne({ _id: personId, ...NOT_ARCHIVED })
        : await Person.findOne({
            _id: personId,
            createdBy: req.userId,
            ...NOT_ARCHIVED,
          });

    if (!person) {
      return res
        .status(404)
        .json({ message: "Person not found or unauthorized." });
    }

    const report =
      req.role === "admin"
        ? await WeeklyReport.findOne({ _id: reportId, person: personId })
        : await WeeklyReport.findOne({
            _id: reportId,
            person: personId,
            reportedBy: req.userId,
          });

    if (!report) {
      return res
        .status(404)
        .json({ message: "Report not found or unauthorized." });
    }

    await WeeklyReport.findByIdAndDelete(reportId);
    logger.info("Weekly report deleted", {
      reportId,
      personId,
      userId: req.userId,
    });
    res.json({ message: "Report deleted successfully." });
  } catch (err: any) {
    logger.error("Error deleting weekly report", {
      error: err.message,
      stack: err.stack,
      reportId,
      personId,
      userId: req.userId,
    });
    res.status(500).json({ message: "Server error: Could not delete report." });
  }
};

export const bulkCreatePersons = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  // Only admin can bulk upload
  if (req.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Only admins can bulk upload contacts." });
  }

  try {
    const { contacts, userIds } = req.body;

    // Validate contacts array
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res
        .status(400)
        .json({ message: "Contacts must be a non-empty array." });
    }

    // Validate userIds array
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one user must be selected." });
    }

    // Validate all user IDs exist
    const validUsers = await Users.find({ _id: { $in: userIds } }).lean();
    if (validUsers.length !== userIds.length) {
      return res
        .status(400)
        .json({ message: "One or more user IDs are invalid." });
    }

    // Create user map for distribution info
    const userMap = new Map(
      validUsers.map((u: any) => [u._id.toString(), u.username]),
    );

    // Distribute contacts evenly among selected users
    const totalContacts = contacts.length;
    const contactsPerUser = Math.floor(totalContacts / userIds.length);
    const remainder = totalContacts % userIds.length;

    // Create distribution plan
    const distribution: Array<{
      userId: string;
      username: string;
      contactCount: number;
    }> = [];
    const contactsByUser: Map<string, any[]> = new Map();

    userIds.forEach((userId, index) => {
      const startIndex = index * contactsPerUser + Math.min(index, remainder);
      const endIndex =
        startIndex + contactsPerUser + (index < remainder ? 1 : 0);
      const userContacts = contacts.slice(startIndex, endIndex);
      contactsByUser.set(userId, userContacts);
      distribution.push({
        userId,
        username: userMap.get(userId) || "Unknown",
        contactCount: userContacts.length,
      });
    });

    const results = {
      success: [] as IPerson[],
      failed: [] as Array<{ contact: any; error: string }>,
    };

    // Process contacts for each user
    for (const [userId, userContacts] of contactsByUser.entries()) {
      for (const contact of userContacts) {
        const { error, value } = personSchema.validate(contact);
        if (error) {
          results.failed.push({
            contact,
            error: error.details[0].message,
          });
          continue;
        }

        try {
          const newPerson: IPerson = new Person({
            name: value.name,
            phone: value.phone,
            address: value.address,
            inviter: value.inviter,
            notes: value.notes || "",
            createdBy: userId,
          });
          await newPerson.save();
          results.success.push(newPerson);
        } catch (err: any) {
          results.failed.push({
            contact,
            error: err.message || "Failed to create contact",
          });
        }
      }
    }

    logger.info("Bulk persons created", {
      successCount: results.success.length,
      failedCount: results.failed.length,
      totalContacts,
      selectedUsers: userIds.length,
      uploadedBy: req.userId,
    });

    res.status(201).json({
      message: `Successfully created ${results.success.length} contacts. ${results.failed.length} failed.`,
      results,
      distribution,
    });
  } catch (err: any) {
    logger.error("Error bulk creating persons", {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    res
      .status(500)
      .json({ message: "Server error: Could not bulk create contacts." });
  }
};

/** Escape a CSV field (wrap in quotes if contains comma, newline, or quote) */
function escapeCsvField(val: string | undefined | null): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const exportContactsAndReports = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }

  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  if (!startDate || !endDate) {
    return res.status(400).json({
      message:
        "Both startDate and endDate query parameters are required (ISO format, e.g. 2025-01-01).",
    });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({
      message: "Invalid date format. Use ISO format (YYYY-MM-DD).",
    });
  }

  if (start > end) {
    return res.status(400).json({
      message: "startDate must be before or equal to endDate.",
    });
  }

  try {
    const includeArchived = req.query.includeArchived === "true";
    const archiveFilter = includeArchived ? {} : NOT_ARCHIVED;
    const allContacts = await Person.find(archiveFilter)
      .populate("createdBy", "username")
      .sort({ name: 1 })
      .lean();

    const reportsInRange = await WeeklyReport.find({
      weekOf: { $gte: start, $lte: end },
    })
      .sort({ weekOf: 1 })
      .lean();

    const reportsByPerson = new Map<string, any[]>();
    for (const r of reportsInRange) {
      const pid = (r as any).person?.toString?.() ?? (r as any).person;
      if (pid) {
        if (!reportsByPerson.has(pid)) reportsByPerson.set(pid, []);
        reportsByPerson.get(pid)!.push(r);
      }
    }

    const headers = [
      "Contact Name",
      "Phone",
      "Address",
      "Inviter",
      "Notes",
      "Assigned To",
      "Reports",
    ];

    const rows: string[] = [];
    for (const contact of allContacts) {
      const c = contact as any;
      const assignedTo = c.createdBy?.username ?? "";
      const personReports = reportsByPerson.get(c._id.toString()) ?? [];

      const reportsText =
        personReports.length > 0
          ? personReports
              .map((r: any) => {
                const weekOf = r.weekOf
                  ? new Date(r.weekOf).toISOString().split("T")[0]
                  : "";
                const contacted = r.contacted ? "Yes" : "No";
                const attended = r.attendedService ? "Yes" : "No";
                return `${weekOf}: Contacted ${contacted} | Attended: ${attended} - ${r.response || ""}`;
              })
              .join("\n")
          : "";

      rows.push(
        [
          escapeCsvField(c.name),
          escapeCsvField(c.phone),
          escapeCsvField(c.address),
          escapeCsvField(c.inviter),
          escapeCsvField(c.notes),
          escapeCsvField(assignedTo),
          escapeCsvField(reportsText),
        ].join(","),
      );
    }

    const csv = [headers.join(","), ...rows].join("\n");
    const filename = `contacts-reports-${startDate}-to-${endDate}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);

    logger.info("Admin export downloaded", {
      startDate,
      endDate,
      contactCount: allContacts.length,
      reportCount: reportsInRange.length,
      adminUserId: req.userId,
    });
  } catch (err: any) {
    logger.error("Error exporting contacts and reports", {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    res.status(500).json({ message: "Server error: Could not export data." });
  }
};

export const archivePerson = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }

  const { id } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Person ID format." });
    }

    const person = await Person.findByIdAndUpdate(
      id,
      { archived: true },
      { new: true },
    );

    if (!person) {
      return res.status(404).json({ message: "Person not found." });
    }

    logger.info("Contact archived", { personId: id, adminUserId: req.userId });
    res.json({ message: "Contact archived successfully.", person });
  } catch (err: any) {
    logger.error("Error archiving person", {
      error: err.message,
      stack: err.stack,
      personId: id,
      userId: req.userId,
    });
    res
      .status(500)
      .json({ message: "Server error: Could not archive contact." });
  }
};

export const unarchivePerson = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }

  const { id } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Person ID format." });
    }

    const person = await Person.findByIdAndUpdate(
      id,
      { archived: false },
      { new: true },
    );

    if (!person) {
      return res.status(404).json({ message: "Person not found." });
    }

    logger.info("Contact unarchived", {
      personId: id,
      adminUserId: req.userId,
    });
    res.json({ message: "Contact unarchived successfully.", person });
  } catch (err: any) {
    logger.error("Error unarchiving person", {
      error: err.message,
      stack: err.stack,
      personId: id,
      userId: req.userId,
    });
    res
      .status(500)
      .json({ message: "Server error: Could not unarchive contact." });
  }
};

export const reassignContact = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }

  const { id } = req.params;

  const { error, value } = reassignContactSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  const { assignedToUserId } = value;

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Person ID format." });
    }
    if (!mongoose.Types.ObjectId.isValid(assignedToUserId)) {
      return res.status(400).json({ message: "Invalid assigned user ID." });
    }

    const newOwner = await Users.findById(assignedToUserId).select("_id username");
    if (!newOwner) {
      return res.status(404).json({ message: "Assigned user not found." });
    }

    const person = await Person.findByIdAndUpdate(
      id,
      { createdBy: assignedToUserId },
      { new: true },
    ).populate("createdBy", "username");

    if (!person) {
      return res.status(404).json({ message: "Person not found." });
    }

    logger.info("Contact reassigned", {
      personId: id,
      assignedToUserId,
      adminUserId: req.userId,
    });
    res.json({
      message: "Contact reassigned successfully.",
      person,
    });
  } catch (err: any) {
    logger.error("Error reassigning contact", {
      error: err.message,
      stack: err.stack,
      personId: id,
      userId: req.userId,
    });
    res
      .status(500)
      .json({ message: "Server error: Could not reassign contact." });
  }
};

export const archiveContactsByDateRange = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }

  const startDate = req.body.startDate ?? req.query.startDate;
  const endDate = req.body.endDate ?? req.query.endDate;

  if (!startDate || !endDate) {
    return res.status(400).json({
      message:
        "Both startDate and endDate are required (ISO format, e.g. 2025-01-01).",
    });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({
      message: "Invalid date format. Use ISO format (YYYY-MM-DD).",
    });
  }

  if (start > end) {
    return res.status(400).json({
      message: "startDate must be before or equal to endDate.",
    });
  }

  try {
    end.setHours(23, 59, 59, 999);

    const result = await Person.updateMany(
      {
        createdAt: { $gte: start, $lte: end },
        ...NOT_ARCHIVED,
      },
      { $set: { archived: true } },
    );

    logger.info("Contacts archived by date range", {
      startDate,
      endDate,
      modifiedCount: result.modifiedCount,
      adminUserId: req.userId,
    });

    res.json({
      message: `Successfully archived ${result.modifiedCount} contact(s).`,
      archivedCount: result.modifiedCount,
    });
  } catch (err: any) {
    logger.error("Error archiving contacts by date range", {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    res
      .status(500)
      .json({ message: "Server error: Could not archive contacts." });
  }
};
