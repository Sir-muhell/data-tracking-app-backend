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
    const validPersonIds = await Person.find({ createdBy: userId }).distinct("_id");
    const totalReports = await WeeklyReport.countDocuments({ 
      reportedBy: userId,
      person: { $in: validPersonIds }
    });
    
    const contactedCount = await WeeklyReport.countDocuments({
      reportedBy: userId,
      contacted: true,
      person: { $in: validPersonIds }
    });
    
    const notContactedCount = totalReports - contactedCount;

    // Check for orphaned reports (reports without valid persons)
    const orphanedReportsCount = await WeeklyReport.countDocuments({
      reportedBy: userId,
      person: { $nin: validPersonIds }
    });

    const recentReports = await WeeklyReport.find({ 
      reportedBy: userId,
      person: { $in: validPersonIds }
    })
      .sort({ weekOf: -1 })
      .limit(5)
      .populate("person", "name")
      .select("weekOf contacted person");

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
        contactedCount,
        notContactedCount,
        contactRate: totalReports > 0 ? ((contactedCount / totalReports) * 100).toFixed(1) : "0",
      },
      recentReports: recentReports.map((r) => ({
        weekOf: r.weekOf,
        contacted: r.contacted,
        personName: (r.person as any)?.name || "Unknown",
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
    const validPersonIds = await Person.find().distinct("_id");
    const totalReports = await WeeklyReport.countDocuments({ 
      person: { $in: validPersonIds }
    });
    
    const contactedCount = await WeeklyReport.countDocuments({ 
      contacted: true,
      person: { $in: validPersonIds }
    });
    const notContactedCount = totalReports - contactedCount;

    const usersWithContacts = await Person.distinct("createdBy");
    const activeUsersCount = usersWithContacts.length;

    const recentReports = await WeeklyReport.find({
      person: { $in: validPersonIds }
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("person", "name")
      .populate("reportedBy", "username")
      .select("weekOf contacted person reportedBy createdAt")
      .lean();

    logger.debug("Admin statistics fetched", { userId: req.userId });
    res.status(200).json({
      statistics: {
        totalUsers,
        activeUsers: activeUsersCount,
        totalContacts,
        totalReports,
        contactedCount,
        notContactedCount,
        contactRate: totalReports > 0 ? ((contactedCount / totalReports) * 100).toFixed(1) : "0",
      },
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
