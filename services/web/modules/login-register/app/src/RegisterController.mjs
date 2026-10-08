import Path from 'path'
import logger from '@overleaf/logger'
import UserRegistrationHandler from '../../../../app/src/Features/User/UserRegistrationHandler.mjs'
import AuthenticationManager from '../../../../app/src/Features/Authentication/AuthenticationManager.mjs'
import EmailHelper from '../../../../app/src/Features/Helpers/EmailHelper.mjs'
import HaveIBeenPwned from '../../../../app/src/Features/Authentication/HaveIBeenPwned.mjs'

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function isAllowedRegistrationDomain(emailDomain, configuredDomainPattern) {
  if (emailDomain == null || configuredDomainPattern == null) {
    return false
  }

  const normalizedDomain = emailDomain.toLowerCase()
  const pattern = configuredDomainPattern.slice(1).toLowerCase()

  // Backward-compatible exact match when no wildcard is used.
  if (!pattern.includes('*')) {
    return normalizedDomain === pattern
  }

  // Wildcard support, e.g. @*.edu.cn -> mail.school.edu.cn, school.edu.cn.
  const regexPattern = `^${pattern
    .split('*')
    .map(segment => escapeRegex(segment))
    .join('.*')}$`

  return new RegExp(regexPattern).test(normalizedDomain)
}

function isValidInviteCode(inviteCode) {
  const requiredInviteCode = process.env.OVERLEAF_PUBLIC_REGISTRATION_INVITE_CODE
  if (requiredInviteCode == null || requiredInviteCode === '') {
    return true
  }

  return inviteCode != null && inviteCode === requiredInviteCode
}

function renderRegisterPage(req, res, { err_message } = {}) {
  const showPasswordField = process.env.OVERLEAF_ALLOW_PUBLIC_REGISTRATION === 'true'
  const showInviteCodeField = Boolean(process.env.OVERLEAF_PUBLIC_REGISTRATION_INVITE_CODE)
  const __dirname = Path.dirname(new URL(import.meta.url).pathname)

  return res.status(err_message ? 429 : 200).render(
    Path.resolve(__dirname, '../views/user/register'),
    {
      showPasswordField,
      showInviteCodeField,
      csrfToken: req.csrfToken(),
      err_message,
      overallThemeOverride: 'system',
    }
  )
}

export default {
  async registerPage(req, res, next) {
    // Check if the user is already logged in
    if (req.user != null) {
      return res.redirect(`/`)
    }

    return renderRegisterPage(req, res)
  },

  // Deal with user registration requests via email
  async registerWithEmail(req, res, next) {
    const { email, inviteCode } = req.body
    if (email == null || email === '') {
      return res.sendStatus(422) // Unprocessable Entity
    }

    if (!isValidInviteCode(inviteCode)) {
      logger.warn({ email, ip: req.ip }, 'Invalid registration invite code.')
      return res.status(400).json({
        message: 'Invalid registration invite code.',
      })
    }

    // Validate email format before attempting to register the user
    const invalidEmail = AuthenticationManager.validateEmail(email)
    if (invalidEmail) {
      logger.warn({ email, ip: req.ip }, 'Invalid email during registration.')
      return res.status(400).json({
        message: {
          type: 'error',
          text: invalidEmail.message,
        }
      })
    }

    // If public registration is restricted to a specific email domain,
    // check that the email domain is allowed
    const domain = EmailHelper.getDomain(email)
    if (!isAllowedRegistrationDomain(domain, process.env.OVERLEAF_ALLOW_PUBLIC_REGISTRATION)) {
      logger.warn(
        {
          email,
          domain,
          allowedDomainPattern: process.env.OVERLEAF_ALLOW_PUBLIC_REGISTRATION,
          ip: req.ip,
        },
        'Registration email domain not allowed.'
      )
      return res.status(400).json({
        message: 'Email domain not allowed for registration.',
      })
    }

    UserRegistrationHandler.registerNewUserAndSendActivationEmail(
      email,
      (error, user, setNewPasswordUrl) => {
        if (error != null) {
          logger.error(
            { err: error, email, ip: req.ip },
            'Error registering new user and sending activation email.'
          )
          return next(error)
        }
        return res.status(200).json({
          message: 'Registration successful. Please check your email to activate your account.',
        })
      }
    )
  },

  // Deal with user registration requests via username and password
  async registerWithUsernameAndPassword(req, res, next) {
    const { email, password, inviteCode } = req.body
    if (email == null || email === '' || password == null || password === '') {
      return res.sendStatus(422) // Unprocessable Entity
    }

    if (!isValidInviteCode(inviteCode)) {
      logger.warn({ email, ip: req.ip }, 'Invalid registration invite code.')
      return res.status(400).json({
        message: 'Invalid registration invite code.',
      })
    }

    // Validate email and password format before attempting to register the user
    const invalidEmail = AuthenticationManager.validateEmail(email)
    if (invalidEmail) {
      logger.warn({ email, ip: req.ip }, 'Invalid email during registration.')
      return res.status(400).json({
        message: {
          type: 'error',
          text: invalidEmail.message,
        }
      })
    }

    const invalidPassword = AuthenticationManager.validatePassword(password, email)
    if (invalidPassword) {
      logger.warn({ email, ip: req.ip }, 'Invalid password during registration.')
      return res.status(400).json({
        message: {
          type: 'error',
          text: invalidPassword.message,
        }
      })
    }

    // Check if the password has been seen in a data breach before allowing the user to register with it
    let isPasswordReused
    try {
      isPasswordReused = await HaveIBeenPwned.promises.checkPasswordForReuse(password)
    } catch (error) {
      logger.error(
        { err: error, email, ip: req.ip },
        'Error checking password against HaveIBeenPwned.'
      )
    }

    if (isPasswordReused) {
      logger.warn({ email, ip: req.ip }, 'Registration password found in data breach.')
      return res.status(400).json({
        message: {
          type: 'error',
          key: 'password-must-be-strong',
          text: 'This password has been seen in a data breach and cannot be used. Please choose a different password.',
        }
      })
    }

    const userDetails = {
      email: email,
      password: password,
      analyticsId: crypto.randomUUID(),
    }

    UserRegistrationHandler.registerNewUser(
      userDetails,
      (error, user) => {
        if (error != null) {
          logger.error({ err: error, email, ip: req.ip }, 'Error registering user.')
          // Sets like "Email already in use" are communicated back to the client
          return res.status(400).json({
            message: error.message,
          })
        }

        // Registration successful
        return res.json(
          {
            redir: '/login',
          }
        )
      }
    )

  }
}
