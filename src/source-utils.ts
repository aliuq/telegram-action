import * as dns from 'node:dns/promises';
import { existsSync, realpathSync } from 'node:fs';
import { isIP } from 'node:net';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * Distinguish path-like inputs from opaque identifiers such as Telegram file ids.
 */
export function looksLikeLocalPath(input: string): boolean {
  return (
    input.startsWith('./') ||
    input.startsWith('../') ||
    input.startsWith('/') ||
    input.includes('/') ||
    input.includes('\\')
  );
}

/**
 * Detect HTTP(S) URLs that should be fetched or handed off remotely.
 */
export function isRemoteUrl(input: string): boolean {
  return /^https?:\/\//.test(input);
}

function getWorkspaceRoot(): string {
  return realpathSync(process.env.GITHUB_WORKSPACE || process.cwd());
}

function isWithinBasePath(base: string, target: string): boolean {
  const relativePath = relative(base, target);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))
  );
}

/**
 * Resolve a repository-relative path against the workspace root.
 * Prefers `GITHUB_WORKSPACE` when running inside GitHub Actions,
 * falling back to `process.cwd()` for local development.
 */
export function resolveWorkspacePath(input: string): string {
  const base = getWorkspaceRoot();
  const resolvedPath = resolve(base, input);
  if (!isWithinBasePath(base, resolvedPath)) {
    throw new Error(`path must stay inside the workspace: ${input}`);
  }

  return resolvedPath;
}

/**
 * Resolve an existing workspace file and reject symlinks that escape the workspace.
 */
export function resolveExistingWorkspacePath(input: string): string {
  const base = getWorkspaceRoot();
  const resolvedPath = resolveWorkspacePath(input);
  if (!existsSync(resolvedPath)) {
    return resolvedPath;
  }

  const realPath = realpathSync(resolvedPath);
  if (!isWithinBasePath(base, realPath)) {
    throw new Error(`path must stay inside the workspace: ${input}`);
  }

  return realPath;
}

function ipv4ToNumber(address: string): number {
  const octets = address.split('.');
  if (octets.length !== 4) {
    throw new Error(`invalid IPv4 address: ${address}`);
  }

  return octets.reduce((result, octet) => {
    const value = Number.parseInt(octet, 10);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error(`invalid IPv4 address: ${address}`);
    }

    return result * 256 + value;
  }, 0);
}

function parseIpv4Octets(address: string): [number, number, number, number] {
  const octets = address.split('.').map((octet) => {
    const value = Number.parseInt(octet, 10);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error(`invalid IPv4 address: ${address}`);
    }

    return value;
  });

  if (octets.length !== 4) {
    throw new Error(`invalid IPv4 address: ${address}`);
  }

  return octets as [number, number, number, number];
}

function expandIpv6(address: string): number[] {
  const normalized = address.toLowerCase().split('%')[0];
  const [head, tail = ''] = normalized.split('::');
  if (normalized.split('::').length > 2) {
    throw new Error(`invalid IPv6 address: ${address}`);
  }

  const headGroups = head ? head.split(':').filter(Boolean) : [];
  const tailGroups = tail ? tail.split(':').filter(Boolean) : [];
  const groups = [...headGroups];
  const missingGroups = 8 - (headGroups.length + tailGroups.length);
  if (missingGroups < 0) {
    throw new Error(`invalid IPv6 address: ${address}`);
  }

  groups.push(...Array.from({ length: missingGroups }, () => '0'));
  groups.push(...tailGroups);

  if (groups.length !== 8) {
    throw new Error(`invalid IPv6 address: ${address}`);
  }

  return groups.flatMap((group) => {
    if (group.includes('.')) {
      const value = ipv4ToNumber(group);
      return [(value >>> 16) & 0xffff, value & 0xffff];
    }

    const value = Number.parseInt(group, 16);
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new Error(`invalid IPv6 address: ${address}`);
    }

    return [value];
  });
}

function isPrivateIpv4(address: string): boolean {
  const [a, b] = parseIpv4Octets(address);
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const groups = expandIpv6(address);
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0) {
    if (groups[5] === 0 && groups[6] === 0 && groups[7] === 0) {
      return true;
    }

    if (groups[5] === 0 && groups[6] === 0 && groups[7] === 1) {
      return true;
    }

    if (groups[5] === 0xffff) {
      const mappedIpv4 = `${groups[6] >>> 8}.${groups[6] & 0xff}.${groups[7] >>> 8}.${groups[7] & 0xff}`;
      return isPrivateIpv4(mappedIpv4);
    }
  }

  if ((groups[0] & 0xfe00) === 0xfc00) {
    return true;
  }

  if ((groups[0] & 0xffc0) === 0xfe80) {
    return true;
  }

  if ((groups[0] & 0xff00) === 0xff00) {
    return true;
  }

  return groups[0] === 0x2001 && groups[1] === 0x0db8;
}

function isPrivateIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return isPrivateIpv4(address);
  }

  if (family === 6) {
    return isPrivateIpv6(address);
  }

  throw new Error(`invalid IP address: ${address}`);
}

interface ResolvedAddress {
  address: string;
  family: number;
}

type LookupHostname = (hostname: string) => Promise<ResolvedAddress[]>;

async function lookupHostname(hostname: string): Promise<ResolvedAddress[]> {
  return dns.lookup(hostname, { all: true, verbatim: true });
}

/**
 * Reject internal-only hosts before using runner-side fetch.
 */
export async function assertPublicHttpUrl(
  input: string,
  lookupAddressList: LookupHostname = lookupHostname,
): Promise<URL> {
  const url = new URL(input);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('message_url must start with http:// or https://');
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error(`message_url must resolve to a public internet host: ${input}`);
  }

  if (isIP(hostname) !== 0) {
    if (isPrivateIpAddress(hostname)) {
      throw new Error(`message_url must resolve to a public internet host: ${input}`);
    }

    return url;
  }

  const addresses = await lookupAddressList(hostname);
  if (addresses.length === 0) {
    throw new Error(`message_url host did not resolve: ${input}`);
  }

  if (addresses.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error(`message_url must resolve to a public internet host: ${input}`);
  }

  return url;
}
