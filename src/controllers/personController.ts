import { Response } from "express";
import mongoose from "mongoose";
import Person, { IPerson } from "../models/Persons";
import WeeklyReport from "../models/WeeklyReports";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  personSchema,
  weeklyReportSchema,
} from "../validation/personValidation";
import Users from "../models/Users";
import logger from "../utils/logger";

export const createPerson = async (
  req: AuthenticatedRequest,
  res: Response
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
    logger.info("Person created", { personId: newPerson._id, userId: req.userId });
    res.status(201).json(newPerson);
  } catch (err: any) {
    logger.error("Error creating person", { error: err.message, stack: err.stack, userId: req.userId });
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

    let query = req.role === "admin" ? {} : { createdBy: req.userId };
    let countQuery = req.role === "admin" ? {} : { createdBy: req.userId };

    const total = await Person.countDocuments(countQuery);
    const persons = await Person.find(query)
      .populate("createdBy", "username")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    logger.debug("Persons fetched", { count: persons.length, total, page, userId: req.userId, role: req.role });
    res.json({
      data: persons,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err: any) {
    logger.error("Error fetching persons", { error: err.message, stack: err.stack, userId: req.userId });
    res.status(500).json({ message: "Server error: Could not fetch persons." });
  }
};

export const addWeeklyReport = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const personId = req.params.personId;

  const { error, value } = weeklyReportSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  const { contacted, response, weekOf } = value;

  try {
    const person = await Person.findOne({
      _id: personId,
      createdBy: req.userId,
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
      reportedBy: req.userId,
    });

    await newReport.save();
    logger.info("Weekly report added", { reportId: newReport._id, personId, userId: req.userId });
    res.status(201).json(newReport);
  } catch (err: any) {
    logger.error("Error adding weekly report", { error: err.message, stack: err.stack, personId, userId: req.userId });
    res.status(500).json({ message: "Server error: Could not add report." });
  }
};

export const getAllReports = async (
  req: AuthenticatedRequest,
  res: Response
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

    logger.debug("All reports fetched", { count: reports.length, total, page, userId: req.userId });
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
    logger.error("Error fetching all reports", { error: err.message, stack: err.stack, userId: req.userId });
    res
      .status(500)
      .json({ message: "Server error: Could not fetch all reports." });
  }
};

export const getReportsByPersonId = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const { personId } = req.params;

  try {
    const person =
      req.role === "admin"
        ? await Person.findById(personId)
        : await Person.findOne({ _id: personId, createdBy: req.userId });

    if (!person) {
      return res
        .status(404)
        .json({ message: "Person not found or unauthorized to access this person." });
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
      personName: person.name 
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
    logger.error("Error fetching reports by person", { error: err.message, stack: err.stack, personId, userId: req.userId });
    res.status(500).json({ message: "Server error: Could not fetch reports." });
  }
};

export const getUsersWithPeopleRecords = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const users = await Users.find().select("_id username role").exec();
    logger.debug("Users with records fetched", { count: users.length, userId: req.userId });
    res.status(200).json(users);
  } catch (err: any) {
    logger.error("Error fetching users", { error: err.message, stack: err.stack, userId: req.userId });
    res.status(500).json({ message: "Server error: Could not fetch users." });
  }
};

export const getPeopleByUserAdmin = async (
  req: AuthenticatedRequest,
  res: Response
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

    const total = await Person.countDocuments({ createdBy: userId });
    const people = await Person.find({ createdBy: userId })
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
      adminUserId: req.userId 
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
    logger.error("Error fetching people by user", { error: err.message, stack: err.stack, targetUserId: userId, adminUserId: req.userId });
    res.status(500).json({ message: "Server error: Could not fetch people records." });
  }
};

export const getUserStatistics = async (
  req: AuthenticatedRequest,
  res: Response
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

    const totalContacts = await Person.countDocuments({ createdBy: userId });
    
    // Only count reports where the person still exists
    const validPersons = await Person.find({ createdBy: userId }).select("_id createdAt").lean() as unknown as Array<{ _id: mongoose.Types.ObjectId; createdAt: Date }>;
    const validPersonIds = validPersons.map(p => p._id);
    const totalReports = await WeeklyReport.countDocuments({ 
      reportedBy: userId,
      person: { $in: validPersonIds }
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
    const weekReportMap = new Map<string, { expected: number; actual: number }>();

    for (const person of validPersons) {
      const personCreatedAt = new Date(person.createdAt);
      const personStartWeek = getMondayOfWeek(personCreatedAt);
      const expectedWeeks = getWeeksBetween(personStartWeek, currentWeek);
      
      totalExpectedReports += expectedWeeks.length;

      // Track expected reports per week
      for (const week of expectedWeeks) {
        const weekKey = week.toISOString().split('T')[0];
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
      person: { $in: validPersonIds }
    })
      .select("weekOf person")
      .lean();

    for (const report of actualReports) {
      const weekOf = new Date(report.weekOf);
      const weekKey = getMondayOfWeek(weekOf).toISOString().split('T')[0];
      if (weekReportMap.has(weekKey)) {
        const stats = weekReportMap.get(weekKey)!;
        stats.actual += 1;
      }
    }

    // Calculate per-week statistics
    const weekStats: Array<{ week: string; expected: number; actual: number; missing: number; completionRate: string }> = [];
    let totalActualReports = 0;
    let totalMissingReports = 0;

    for (const [weekKey, stats] of weekReportMap.entries()) {
      const missing = stats.expected - stats.actual;
      const completionRate = stats.expected > 0 
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
    weekStats.sort((a, b) => new Date(b.week).getTime() - new Date(a.week).getTime());

    // Calculate overall completion rate
    const reportCompletionRate = totalExpectedReports > 0 
      ? ((totalActualReports / totalExpectedReports) * 100).toFixed(1)
      : "0";

    // Get recent reports
    const recentReports = await WeeklyReport.find({ 
      reportedBy: userId,
      person: { $in: validPersonIds }
    })
      .sort({ weekOf: -1, createdAt: -1 })
      .limit(10)
      .populate("person", "name")
      .select("weekOf contacted person createdAt")
      .lean();

    // Check for orphaned reports (reports without valid persons)
    const orphanedReportsCount = await WeeklyReport.countDocuments({
      reportedBy: userId,
      person: { $nin: validPersonIds }
    });

    logger.debug("User statistics fetched", { 
      targetUserId: userId, 
      adminUserId: req.userId,
      orphanedReports: orphanedReportsCount 
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
      },
      weekStats: weekStats.slice(0, 12), // Last 12 weeks
      recentReports: recentReports.map((r: any) => ({
        weekOf: r.weekOf,
        contacted: r.contacted,
        personName: r.person?.name || "Unknown",
        createdAt: r.createdAt,
      })),
    };

    if (orphanedReportsCount > 0) {
      response.warning = `Found ${orphanedReportsCount} orphaned report(s) (reports for deleted contacts). Run cleanup script to remove them.`;
      logger.warn("Orphaned reports detected", { 
        userId, 
        count: orphanedReportsCount 
      });
    }

    res.status(200).json(response);
  } catch (err: any) {
    logger.error("Error fetching user statistics", { error: err.message, stack: err.stack, targetUserId: userId, adminUserId: req.userId });
    res.status(500).json({ message: "Server error: Could not fetch user statistics." });
  }
};

export const getAdminStatistics = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const totalUsers = await Users.countDocuments();
    const totalContacts = await Person.countDocuments();
    
    // Only count reports where the person still exists
    const validPersons = await Person.find().select("_id createdAt createdBy").lean() as unknown as Array<{ _id: mongoose.Types.ObjectId; createdAt: Date; createdBy: mongoose.Types.ObjectId }>;
    const validPersonIds = validPersons.map(p => p._id);
    const totalReports = await WeeklyReport.countDocuments({ 
      person: { $in: validPersonIds }
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
    const weekReportMap = new Map<string, { expected: number; actual: number }>();

    for (const person of validPersons) {
      const personCreatedAt = new Date(person.createdAt);
      const personStartWeek = getMondayOfWeek(personCreatedAt);
      const expectedWeeks = getWeeksBetween(personStartWeek, currentWeek);
      
      totalExpectedReports += expectedWeeks.length;

      // Track expected reports per week
      for (const week of expectedWeeks) {
        const weekKey = week.toISOString().split('T')[0];
        if (!weekReportMap.has(weekKey)) {
          weekReportMap.set(weekKey, { expected: 0, actual: 0 });
        }
        const stats = weekReportMap.get(weekKey)!;
        stats.expected += 1;
      }
    }

    // Get actual reports grouped by week
    const actualReports = await WeeklyReport.find({
      person: { $in: validPersonIds }
    })
      .select("weekOf person")
      .lean();

    let totalActualReports = 0;
    for (const report of actualReports) {
      const weekOf = new Date(report.weekOf);
      const weekKey = getMondayOfWeek(weekOf).toISOString().split('T')[0];
      if (weekReportMap.has(weekKey)) {
        const stats = weekReportMap.get(weekKey)!;
        stats.actual += 1;
        totalActualReports += 1;
      }
    }

    // Calculate per-week statistics
    const weekStats: Array<{ week: string; expected: number; actual: number; missing: number; completionRate: string }> = [];
    let totalMissingReports = 0;

    for (const [weekKey, stats] of weekReportMap.entries()) {
      const missing = stats.expected - stats.actual;
      const completionRate = stats.expected > 0 
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
    weekStats.sort((a, b) => new Date(b.week).getTime() - new Date(a.week).getTime());

    // Calculate overall completion rate
    const reportCompletionRate = totalExpectedReports > 0 
      ? ((totalActualReports / totalExpectedReports) * 100).toFixed(1)
      : "0";

    const usersWithContacts = await Person.distinct("createdBy");
    const activeUsersCount = usersWithContacts.length;

    // Get users with their report completion stats (per week)
    const usersWithReportStats = await Users.find({ _id: { $in: usersWithContacts } })
      .select("username _id")
      .lean();
    
    const userReportStats = await Promise.all(
      usersWithReportStats.map(async (u: any) => {
        const userPersons = await Person.find({ createdBy: u._id }).select("_id createdAt").lean() as unknown as Array<{ _id: mongoose.Types.ObjectId; createdAt: Date }>;
        const userPersonIds = userPersons.map(p => p._id);
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
          person: { $in: userPersonIds }
        });
        
        const userCompletionRate = userExpected > 0
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
      })
    );

    const recentReports = await WeeklyReport.find({
      person: { $in: validPersonIds }
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("person", "name")
      .populate("reportedBy", "username")
      .select("weekOf contacted person reportedBy createdAt")
      .lean();

    // Get unique weeks with reports
    const weeksWithReportsRaw = await WeeklyReport.distinct("weekOf", {
      person: { $in: validPersonIds }
    });
    const weeksWithReports = (weeksWithReportsRaw as Date[]).sort((a: Date, b: Date) => b.getTime() - a.getTime());

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
      },
      weekStats: weekStats.slice(0, 12), // Last 12 weeks
      userReportStats,
      recentReports: recentReports.map((r: any) => ({
        weekOf: r.weekOf,
        contacted: r.contacted,
        personName: r.person?.name || "Unknown",
        reportedBy: r.reportedBy?.username || "Unknown",
        createdAt: r.createdAt,
      })),
    });
  } catch (err: any) {
    logger.error("Error fetching admin statistics", { error: err.message, stack: err.stack, userId: req.userId });
    res.status(500).json({ message: "Server error: Could not fetch admin statistics." });
  }
};

export const getPersonById = async (
  req: AuthenticatedRequest,
  res: Response
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
    logger.error("Error fetching person by ID", { error: err.message, stack: err.stack, personId: id, userId: req.userId });
    res.status(500).json({ message: "Server error: Could not fetch person." });
  }
};

export const updatePerson = async (
  req: AuthenticatedRequest,
  res: Response
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
    logger.error("Error updating person", { error: err.message, stack: err.stack, personId: id, userId: req.userId });
    res.status(500).json({ message: "Server error: Could not update person." });
  }
};

export const deletePerson = async (
  req: AuthenticatedRequest,
  res: Response
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
    res.json({ message: "Person and associated reports deleted successfully." });
  } catch (err: any) {
    logger.error("Error deleting person", { error: err.message, stack: err.stack, personId: id, userId: req.userId });
    res.status(500).json({ message: "Server error: Could not delete person." });
  }
};

export const updateWeeklyReport = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const { personId, reportId } = req.params;

  const { error, value } = weeklyReportSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  try {
    if (!mongoose.Types.ObjectId.isValid(personId) || !mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ message: "Invalid ID format." });
    }

    const person =
      req.role === "admin"
        ? await Person.findById(personId)
        : await Person.findOne({ _id: personId, createdBy: req.userId });

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

    const { contacted, response, weekOf } = value;
    report.contacted = contacted;
    report.response = response;
    report.weekOf = weekOf;

    await report.save();
    logger.info("Weekly report updated", { reportId, personId, userId: req.userId });
    res.json(report);
  } catch (err: any) {
    logger.error("Error updating weekly report", { error: err.message, stack: err.stack, reportId, personId, userId: req.userId });
    res.status(500).json({ message: "Server error: Could not update report." });
  }
};

export const deleteWeeklyReport = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const { personId, reportId } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(personId) || !mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ message: "Invalid ID format." });
    }

    const person =
      req.role === "admin"
        ? await Person.findById(personId)
        : await Person.findOne({ _id: personId, createdBy: req.userId });

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
    logger.info("Weekly report deleted", { reportId, personId, userId: req.userId });
    res.json({ message: "Report deleted successfully." });
  } catch (err: any) {
    logger.error("Error deleting weekly report", { error: err.message, stack: err.stack, reportId, personId, userId: req.userId });
    res.status(500).json({ message: "Server error: Could not delete report." });
  }
};

export const bulkCreatePersons = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // Only admin can bulk upload
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Only admins can bulk upload contacts." });
  }

  try {
    const { contacts, userIds } = req.body;

    // Validate contacts array
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ message: "Contacts must be a non-empty array." });
    }

    // Validate userIds array
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "At least one user must be selected." });
    }

    // Validate all user IDs exist
    const validUsers = await Users.find({ _id: { $in: userIds } });
    if (validUsers.length !== userIds.length) {
      return res.status(400).json({ message: "One or more user IDs are invalid." });
    }

    // Create user map for distribution info
    const userMap = new Map(validUsers.map(u => [u._id.toString(), u.username]));

    // Distribute contacts evenly among selected users
    const totalContacts = contacts.length;
    const contactsPerUser = Math.floor(totalContacts / userIds.length);
    const remainder = totalContacts % userIds.length;

    // Create distribution plan
    const distribution: Array<{ userId: string; username: string; contactCount: number }> = [];
    const contactsByUser: Map<string, any[]> = new Map();

    userIds.forEach((userId, index) => {
      const startIndex = index * contactsPerUser + Math.min(index, remainder);
      const endIndex = startIndex + contactsPerUser + (index < remainder ? 1 : 0);
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
    res.status(500).json({ message: "Server error: Could not bulk create contacts." });
  }
};
