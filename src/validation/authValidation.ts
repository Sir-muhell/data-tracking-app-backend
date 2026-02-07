import Joi from "joi";

export const registerSchema = Joi.object({
  username: Joi.string().trim().min(3).max(30).pattern(/^[a-zA-Z0-9_]+$/)
    .required()
    .messages({
      "string.min": "Username must be at least 3 characters long.",
      "string.max": "Username must not exceed 30 characters.",
      "string.pattern.base": "Username can only contain letters, numbers, and underscores.",
      "string.empty": "Username is required.",
    }),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters long.",
      "string.pattern.base": "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&).",
      "string.empty": "Password is required.",
    }),
});

export const loginSchema = Joi.object({
  username: Joi.string().trim().required()
    .messages({
      "string.empty": "Username is required.",
    }),
  password: Joi.string().required()
    .messages({
      "string.empty": "Password is required.",
    }),
});
