import Joi from "joi";

export const personSchema = Joi.object({
  name: Joi.string().trim().required().min(2).max(100)
    .messages({
      "string.min": "Name must be at least 2 characters long.",
      "string.max": "Name must not exceed 100 characters.",
      "string.empty": "Name is required.",
    }),
  phone: Joi.string()
    .trim()
    .required()
    .custom((value, helpers) => {
      const digitsOnly = value.replace(/\D/g, "");
      if (digitsOnly.length !== 11) return helpers.error("phone.exact");
      return value;
    })
    .messages({
      "string.empty": "Phone number is required.",
      "phone.exact": "Phone number must be exactly 11 digits.",
    }),
  address: Joi.string().trim().required().min(3).max(200)
    .messages({
      "string.min": "Address must be at least 3 characters long.",
      "string.max": "Address must not exceed 200 characters.",
      "string.empty": "Address is required.",
    }),
  inviter: Joi.string().trim().required().min(2).max(100)
    .messages({
      "string.min": "Inviter name must be at least 2 characters long.",
      "string.max": "Inviter name must not exceed 100 characters.",
      "string.empty": "Inviter name is required.",
    }),
  notes: Joi.string().trim().allow("").optional().max(1000)
    .messages({
      "string.max": "Notes must not exceed 1000 characters.",
    }),
});

export const weeklyReportSchema = Joi.object({
  contacted: Joi.boolean().required()
    .messages({
      "boolean.base": "Contacted status must be a boolean value.",
    }),
  attendedService: Joi.boolean().optional().default(false)
    .messages({
      "boolean.base": "Attended service must be a boolean value.",
    }),
  response: Joi.string().trim().required().min(1).max(2000)
    .messages({
      "string.min": "Response cannot be empty.",
      "string.max": "Response must not exceed 2000 characters.",
      "string.empty": "Response is required.",
    }),
  weekOf: Joi.date().iso().required().max("now")
    .messages({
      "date.base": "Week of must be a valid date.",
      "date.format": "Week of must be in ISO date format (YYYY-MM-DD).",
      "date.max": "Week of cannot be in the future.",
    }),
});
