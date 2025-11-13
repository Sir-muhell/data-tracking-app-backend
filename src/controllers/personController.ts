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

// --- Create New Person ---
export const createPerson = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // 1. Validate the request body
  const { error, value } = personSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  const { name, phone, address, inviter, notes } = value;

  try {
    // 2. Create the person, linked to the authenticated user
    const newPerson: IPerson = new Person({
      name,
      phone,
      address,
      inviter,
      notes,
      createdBy: req.userId, // Set from the authentication token
    });

    await newPerson.save();
    res.status(201).json(newPerson);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error: Could not create person." });
  }
};

// --- Get All Persons (User vs. Admin Logic) ---
export const getPersons = async (req: AuthenticatedRequest, res: Response) => {
  try {
    let persons;

    if (req.role === "admin") {
      // Admin: Fetch all persons and populate the creator's username
      persons = await Person.find().populate("createdBy", "username");
    } else {
      // Standard User: Fetch only persons they created
      persons = await Person.find({ createdBy: req.userId });
    }

    res.json(persons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error: Could not fetch persons." });
  }
};

// --- Add Weekly Report ---
export const addWeeklyReport = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const personId = req.params.personId;

  // 1. Validate the request body
  const { error, value } = weeklyReportSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  const { contacted, response, weekOf } = value;

  try {
    // 2. Check if the person exists and belongs to the current user (security)
    const person = await Person.findOne({
      _id: personId,
      createdBy: req.userId,
    });

    if (!person) {
      // Admin users could theoretically report on others, but for simplicity,
      // we enforce users only report on their own entries.
      return res
        .status(404)
        .json({ message: "Person not found or unauthorized." });
    }

    // 3. Create and save the weekly report
    const newReport = new WeeklyReport({
      person: personId,
      contacted,
      response,
      weekOf,
      reportedBy: req.userId,
    });

    await newReport.save();
    res.status(201).json(newReport);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error: Could not add report." });
  }
};

// --- Admin: Get All Weekly Reports ---
export const getAllReports = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    // Only run if isAdmin middleware passes (checked in routes)
    const reports = await WeeklyReport.find()
      .populate("person", "name phone createdBy") // Show person details
      .populate("reportedBy", "username"); // Show user who reported it

    res.json(reports);
  } catch (err) {
    console.error(err);
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
  // console.log(personId, req.userId);
  // 1. Check if the Person exists and belongs to the user

  const person =
    req.role === "admin"
      ? await Person.findById(personId)
      : await Person.findOne({ _id: personId, createdBy: req.userId });

  // console.log(person);
  if (!person) {
    res.status(404);
    throw new Error("Person not found or unauthorized to access this person.");
  }

  // 2. Fetch all reports linked to that person, sorted by week (newest first)
  const reports = await WeeklyReport.find({
    person: personId,
  }).sort({ weekOf: -1, createdAt: -1 }); // Sort by week date, then creation date

  res.json({ personName: person.name, reports });
};

export const getUsersWithPeopleRecords = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // Find all unique user IDs present in the 'createdBy' field of the Person collection
  const uniqueUserIds = await Person.distinct("createdBy");
  // console.log("uniqueIds", uniqueUserIds);
  // Fetch the actual User documents for those IDs
  const users = await Users.find().select("_id username role").exec();
  // console.log(users);
  res.status(200).json(users);
};

export const getPeopleByUserAdmin = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const { userId } = req.params;
  // console.log(userId);
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400);
    throw new Error("Invalid User ID format.");
  }

  // Fetch all Person records created by the specified user
  const people = await Person.find({ createdBy: userId })
    .select("-__v -createdBy")
    .exec();

  res.status(200).json(people);
};
