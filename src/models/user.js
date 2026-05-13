/**
 * User models for Aurora.
 *
 * Two origins:
 *   source: 'webClient'  — authenticated via PlantaoAPI API
 *   source: 'aurora'  — authenticated via Firebase Auth (email or Google)
 *
 * Both are normalized into the same NormalizedUser shape before being stored
 * in AuthContext and AsyncStorage. Consumers should only depend on NormalizedUser.
 */

// ─── WebClient Raw API Response ──────────────────────────────────────────────────
// Shape returned by POST /auth/login (PlantaoAPI API).
// Reference only — never stored directly; always normalize before use.
//
// {
//   "id": "abc123xyz",
//   "name": "Dr. Nome Exemplo",
//   "call_name": "Exemplo",
//   "username": "@exemplo",
//   "email": "exemplo@email.com",
//   "photo": "https://example.com/photo.jpg",
//   "phone": "(11) 99999-0000",
//   "bio": null, "about": null, "gender": 2, "birth_date": "1990-01-01",
//   "country": "BR", "state": "SP", "cpf": "000.000.000-00",
//   "status": 1, "is_premium": false, "is_admin": false, "is_manager": false,
//   "is_corp": false, "is_beta_user": false, "is_advertiser": false,
//   "is_private_email": false, "enable_push": true, "terms_of_use": true,
//   "council": { "id": "21684", "state": "CE" },
//   "profession": { "id": 1, "name": "Médico", "has_council": true, "has_council_state": true, "has_specializations": true },
//   "specialization": { "id": 36, "name": "Pediatria", "slug": "pediatria" },
//   "specializations": [{ "id": 36, "name": "Pediatria", "slug": "pediatria" }],
//   "subscription": null,
//   "last_login": { "date": "2026-04-18 11:01:59", "type": 3 },
//   "created_at": "2021-06-24 16:29:21",
//   "has_groups_corp": false, "groups_validated": null, "quant_corp": null,
//   "defined_opportunities_preferences": true, "pending_stages": [],
//   "unconfirmed_data": ["phone"], "social_accounts": [], "cooperatives": [],
//   "academic_leagues": [], "certifications": [], "professional_experiences": [],
//   "formations": [], "curriculum_link": null,
//   "token": "eyJ0eXAiOiJKV1..."   // only present in login response
// }

// ─── WebClient Normalized User ───────────────────────────────────────────────────
// Shape stored in AsyncStorage / AuthContext after WebClient login.
// Produced by AuthContext.login() normalization step.
//
// {
//   "id": "abc123xyz",
//   "name": "Dr. Nome Exemplo",
//   "email": "exemplo@email.com",
//   "username": "@exemplo",
//   "role": "",
//   "photo": "https://example.com/photo.jpg",
//   "council": { "state": "SP", "id": "12345" },
//   "phone": "(11) 99999-0000",
//   "is_premium": false
//   // NOTE: source field absent for legacy WebClient users — treat missing source as 'webClient'
// }

// ─── Aurora User (email signup or Google) ────────────────────────────────────
// Shape stored in AsyncStorage / AuthContext after Aurora signup/Google login.
// Produced by SignupService.createAccount() or GoogleSignInService.handleGoogleSignIn().
//
// {
//   "id": "firebase_uid",
//   "name": "Nome Completo",
//   "email": "user@example.com",
//   "username": "nomeusuario",
//   "role": "",
//   "photo": "https://storage.googleapis.com/..." | null,
//   "council": { "id": "12345", "state": "SP" },
//   "phone": "",
//   "is_premium": false,
//   "source": "aurora"
// }

// ─── NormalizedUser — canonical shape, use this everywhere ───────────────────
/**
 * @typedef {Object} NormalizedUser
 * @property {string}  id
 * @property {string}  name
 * @property {string}  email
 * @property {string}  username
 * @property {string}  role
 * @property {string|null} photo
 * @property {{ id: string, state: string }} council
 * @property {string}  phone
 * @property {boolean} is_premium
 * @property {'webClient'|'aurora'} [source]  absent = legacy WebClient user
 */

export {};
