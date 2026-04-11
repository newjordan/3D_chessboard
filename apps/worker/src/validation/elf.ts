import fs from "fs/promises";

/**
 * Validates that a file is a 64-bit Linux ELF executable.
 * Magic bytes for ELF: 7F 45 4C 46 (0x7f 'E' 'L' 'F')
 */
export async function validateElfHeader(filePath: string): Promise<{
  isValid: boolean;
  error?: string;
  arch?: string;
}> {
  try {
    const handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(16);
    await handle.read(buffer, 0, 16, 0);
    await handle.close();

    // Check magic bytes: 0x7F, 'E', 'L', 'F'
    if (
      buffer[0] !== 0x7f ||
      buffer[1] !== 0x45 ||
      buffer[2] !== 0x4c ||
      buffer[3] !== 0x46
    ) {
      return { isValid: false, error: "Not a valid ELF binary. Missing ELF magic bytes." };
    }

    // Check class: 1 = 32-bit, 2 = 64-bit
    const is64bit = buffer[4] === 2;
    if (!is64bit) {
      return { isValid: false, error: "32-bit ELF binaries are not supported. Please provide 64-bit." };
    }

    // Check endianness: 1 = little, 2 = big
    const isLittleEndian = buffer[5] === 1;
    if (!isLittleEndian) {
      return { isValid: false, error: "Big-endian ELF binaries are not supported." };
    }

    return { isValid: true, arch: "x86_64" };
  } catch (error: any) {
    return { isValid: false, error: `Failed to read file: ${error.message}` };
  }
}
