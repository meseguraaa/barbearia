/* ---------------------------------------------------------
 * Password Policy (fonte da verdade)
 * ---------------------------------------------------------
 * Regras:
 * - mínimo 6 caracteres
 * - pelo menos 1 letra maiúscula
 * - pelo menos 1 número
 * - pelo menos 1 caractere especial
 *   !@#$%^&*()_+-=[]{};':",.<>/?\|
 * - sem espaços
 * ---------------------------------------------------------*/

const SPECIAL_CHARACTERS = `!@#$%^&*()_+-=[]{};':",.<>/?\\|`;

const UPPERCASE_REGEX = /[A-Z]/;
const NUMBER_REGEX = /\d/;

// Escapa corretamente caracteres especiais para uso em regex dentro de [...]
const SPECIAL_REGEX = new RegExp(
  `[${SPECIAL_CHARACTERS.replace(/[\\\]\-\^]/g, "\\$&")}]`,
);

export type PasswordValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 6) {
    errors.push("A senha deve ter no mínimo 6 caracteres.");
  }

  if (!UPPERCASE_REGEX.test(password)) {
    errors.push("A senha deve conter pelo menos 1 letra maiúscula.");
  }

  if (!NUMBER_REGEX.test(password)) {
    errors.push("A senha deve conter pelo menos 1 número.");
  }

  if (!SPECIAL_REGEX.test(password)) {
    errors.push(
      `A senha deve conter pelo menos 1 caractere especial (${SPECIAL_CHARACTERS}).`,
    );
  }

  if (/\s/.test(password)) {
    errors.push("A senha não pode conter espaços.");
  }

  return { ok: errors.length === 0, errors };
}
