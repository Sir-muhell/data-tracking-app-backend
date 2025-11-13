import Joi from "joi";

export const personSchema = Joi.object({
  name: Joi.string().required().min(2),
  phone: Joi.string()
    .pattern(/^\d{10,}$/)
    .required()
    .messages({
      "string.pattern.base": "Phone number must be at least 10 digits.",
    }),
  address: Joi.string().required(),
  inviter: Joi.string().required(),
  notes: Joi.string().allow("").optional(),
});

export const weeklyReportSchema = Joi.object({
  // personId will be taken from the URL parameter, not body
  contacted: Joi.boolean().required(),
  response: Joi.string().required().min(1),
  weekOf: Joi.date().iso().required(), // Ensures a valid date format
});
