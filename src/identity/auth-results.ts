export interface AuthenticationResult {
  result: string;
  domain?: string;
}

export interface ParsedAuthenticationResults {
  spf: AuthenticationResult;
  dkim: AuthenticationResult;
  dmarc: AuthenticationResult;
}

const EMPTY_RESULT: AuthenticationResult = {
  result: "none"
};

export function parseAuthenticationResults(value: string): ParsedAuthenticationResults {
  return {
    spf: parseCheck(value, /spf=([^\s;]+)/i, /smtp\.mailfrom=([^\s;]+)/i),
    dkim: parseCheck(value, /dkim=([^\s;]+)/i, /header\.d=([^\s;]+)/i),
    dmarc: parseCheck(value, /dmarc=([^\s;]+)/i, /header\.from=([^\s;]+)/i)
  };
}

function parseCheck(
  value: string,
  resultPattern: RegExp,
  domainPattern: RegExp
): AuthenticationResult {
  const result = value.match(resultPattern)?.[1]?.toLowerCase();
  const domain = value.match(domainPattern)?.[1]?.toLowerCase();

  if (!result) {
    return EMPTY_RESULT;
  }

  return {
    result,
    domain
  };
}
