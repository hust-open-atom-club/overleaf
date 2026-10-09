import logger from "@overleaf/logger"
import Settings from "@overleaf/settings"
import RegisterController from './RegisterController.mjs'
import LoginController, { localLoginDisabled } from "./LoginController.mjs"
import AuthenticationController from '../../../../app/src/Features/Authentication/AuthenticationController.mjs'
import RateLimiterMiddleware from "../../../../app/src/Features/Security/RateLimiterMiddleware.mjs"
import { RateLimiter } from "../../../../app/src/infrastructure/RateLimiter.mjs"

// Limit registration attempts to 5 per 60 minutes per IP
const registrationRateLimiters = {
  postRegister: new RateLimiter('postRegister', {
    points: 5,
    duration: 60 * 60,
  }),
}

function registrationRateLimitHandler(req, res) {
  const rateLimitMessage =
    'Too many registration attempts from this IP. Please try again after 60 minutes.'

  logger.warn({ ip: req.ip }, 'registration rate limit exceeded')

  if (req.accepts('json')) {
    return res.status(429).json({
      message: {
        type: 'error',
        text: rateLimitMessage,
      },
    })
  }

  res.status(429)
  return res.render('user/register', {
    err_message: rateLimitMessage,
    csrfToken: req.csrfToken(),
    showPasswordField: process.env.OVERLEAF_ALLOW_PUBLIC_REGISTRATION === 'true',
    showInviteCodeField: Boolean(process.env.OVERLEAF_PUBLIC_REGISTRATION_INVITE_CODE),
    overallThemeOverride: 'system',
  })
}


export default {
  apply(webRouter) {
    logger.debug({}, 'Init Registration module')

    // Public Register
    if (process.env.OVERLEAF_ALLOW_PUBLIC_REGISTRATION === 'true' ||
      (process.env.OVERLEAF_ALLOW_PUBLIC_REGISTRATION != null &&
        process.env.OVERLEAF_ALLOW_PUBLIC_REGISTRATION.startsWith('@'))) {
      // remove default registration router if it exists
      webRouter.stack = webRouter.stack.filter(layer => {
        return !(layer.route && layer.route.path === '/register' && layer.route.methods.get)
      })

      webRouter.get(
        '/register',
        RegisterController.registerPage
      )

      const allowedRegistrationDomain =
        process.env.OVERLEAF_ALLOW_PUBLIC_REGISTRATION

      // If set to 'true', allow registration via username and password
      // If set to an email domain (e.g., '@example.com'), allow registration via email only for that domain
      if (allowedRegistrationDomain != null && allowedRegistrationDomain == 'true') {
        webRouter.post(
          '/register',
          RateLimiterMiddleware.rateLimit(registrationRateLimiters.postRegister, {
            ipOnly: true,
            onRateLimit: registrationRateLimitHandler,
          }),
          RegisterController.registerWithUsernameAndPassword
        )
      }
      else if (allowedRegistrationDomain != null && allowedRegistrationDomain.startsWith('@')) {
        webRouter.post(
          '/register',
          RateLimiterMiddleware.rateLimit(registrationRateLimiters.postRegister, {
            ipOnly: true,
            onRateLimit: registrationRateLimitHandler,
          }),

          RegisterController.registerWithEmail
        )
      }
      AuthenticationController.addEndpointToLoginWhitelist('/register')
    }


    // Public login
    // remove default login router
    webRouter.stack = webRouter.stack.filter(layer => {
      return !(layer.route && layer.route.path === '/login' && (layer.route.methods.get || (layer.route.methods.post && localLoginDisabled())))
    })

    webRouter.get('/login', LoginController.loginPage)
    AuthenticationController.addEndpointToLoginWhitelist('/login')

    if (Settings.ldap && Settings.ldap.enable) {
      webRouter.get('/ldap/login', LoginController.ldapLoginPage)
      AuthenticationController.addEndpointToLoginWhitelist('/ldap/login')
    }
  },
}
