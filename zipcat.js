export async function * zipcat(files) {
    const utf8enc = new TextEncoder();
    const hbuf = new Uint8Array(128);
    const hv = new DataView(hbuf.buffer);
    const le = true;
    const cdir = [];
    let bytes_emitted = 0n;
  
    for await (const { name, data } of files) {
      const namebuf = utf8enc.encode(name);
      if (namebuf.byteLength > 0xffff) {
        throw RangeError(`Zip entry name is too long (${namebuf.byteLength})`);
      }
      const offset = bytes_emitted;
  
      hv.setUint16(0, 0x0001, le);
      hv.setUint16(2, 16, le);
      hv.setBigUint64(4, 0n, le); // Original uncompressed file size
      hv.setBigUint64(12, 0n, le); // Size of compressed data
      const ext = hbuf.slice(0, 20);
  
      hv.setUint32(0, 0x04034b50, le); // local file header signature
      hv.setUint16(4, 45, le); // version needed to extract
      hv.setUint16(6, 1 << 3, le); // general purpose bit flag
      hv.setUint16(8, 0, le); // compression method
      hv.setUint16(10, 0, le); // last mod file time
      hv.setUint16(12, 0, le); // last mod file date
      hv.setUint32(14, 0, le); // crc-32
      hv.setUint32(18, -1, le); // compressed size
      hv.setUint32(22, -1, le); // // uncompressed size
      hv.setUint16(26, namebuf.byteLength, le); // file name length
      hv.setUint16(28, ext.byteLength, le); // extra field length
      const fixed = hbuf.slice(0, 30); // TODO subarray
  
      yield fixed;
      bytes_emitted += BigInt(fixed.byteLength);
  
      yield namebuf;
      bytes_emitted += BigInt(namebuf.byteLength);
  
      yield ext;
      bytes_emitted += BigInt(ext.byteLength);
  
      let size = 0n;
      let crc32 = 0;
      const data_iter = data instanceof Uint8Array ? [data] : data;
      for await (const chunk of data_iter) {
        size += BigInt(chunk.byteLength);
        crc32 = crc32calc(chunk, crc32);
        yield chunk;
      }
      bytes_emitted += size;
  
      hv.setUint32(0, crc32, le); // crc-32
      hv.setBigUint64(4, size, le); // compressed size
      hv.setBigUint64(12, size, le); // uncompressed size
      const desc = hbuf.slice(0, 20); // TODO subarray
  
      yield desc;
      bytes_emitted += BigInt(desc.byteLength);
  
      cdir.push({ namebuf, size, crc32, offset });
    }
  
    const cdir_start = bytes_emitted;
    let cdir_size = 0n;
    for (const { namebuf, size, crc32, offset } of cdir) {
      hv.setUint16(0, 0x0001, le); // Zip64 extended information extra field
      hv.setUint16(2, 24, le); // size of this "extra" block
      hv.setBigUint64(4, size, le); // Original uncompressed file size
      hv.setBigUint64(12, size, le); // Size of compressed data
      hv.setBigUint64(20, offset, le); // Offset of local header record
      const ext = hbuf.slice(0, 28); // TODO subarray
  
      hv.setUint32(0, 0x02014b50, le); // central file header signature
      hv.setUint16(4, 45, le); // version made by
      hv.setUint16(6, 45, le); // version needed to extract
      hv.setUint16(8, 0, le); // general purpose bit flag
      hv.setUint16(10, 0, le); // compression method
      hv.setUint16(12, 0, le); // last mod file time
      hv.setUint16(14, 0, le);  // last mod file date
      hv.setUint32(16, crc32, le);  // crc-32
      hv.setUint32(20, -1, le); // compressed size
      hv.setUint32(24, -1, le); // uncompressed size
      hv.setUint16(28, namebuf.byteLength, le); // file name length
      hv.setUint16(30, ext.byteLength, le); // extra field length
      hv.setUint16(32, 0, le); // file comment length
      hv.setUint16(34, 0, le); // disk number start
      hv.setUint16(36, 0, le); // internal file attributes
      hv.setUint32(38, 0, le); // external file attributes
      hv.setUint32(42, -1, le); // relative offset of local header
      const fixed = hbuf.slice(0, 46); // TODO subarray
  
      yield fixed;
      cdir_size += BigInt(fixed.byteLength);
  
      yield namebuf;
      cdir_size += BigInt(namebuf.byteLength);
  
      yield ext;
      cdir_size += BigInt(ext.byteLength);
  
      // yield new Uint8Array(0); // file comment (variable size)
    }
  
    const cdir_length = BigInt(cdir.length);
  
    hv.setUint32(0, 0x06064b50, le); // zip64 end of central dir signature
    hv.setBigUint64(4, 44n, le); // size of zip64 end of central directory record
    hv.setUint16(12, 45, le); // version made by
    hv.setUint16(14, 45, le); // version needed to extract
    hv.setUint32(16, 0, le); // number of this disk
    hv.setUint32(20, 0, le); // number of the disk with the start of the central directory
    hv.setBigUint64(24, cdir_length, le); // total number of entries in the central directory on this disk
    hv.setBigUint64(32, cdir_length, le); // total number of entries in the central directory
    hv.setBigUint64(40, cdir_size, le); // size of the central directory
    hv.setBigUint64(48, cdir_start, le); // offset of start of central directory with respect to the starting disk number
    yield hbuf.slice(0, 56); // TODO subarray
  
    hv.setUint32(0, 0x07064b50, le); // zip64 end of central dir locator signature
    hv.setUint32(4, 0, le); // number of the disk with the start of the zip64 end of central directory
    hv.setBigUint64(8, cdir_start + cdir_size, le); // relative offset of the zip64 end of central directory record
    hv.setUint32(16, 1, le); // total number of disks
    yield hbuf.slice(0, 20); // TODO subarray
  
    hv.setUint32(0, 0x06054b50, le); // end of central dir signature
    hv.setUint16(4, 0, le); // number of this disk
    hv.setUint16(6, 0, le); // number of the disk with the start of the central directory
    hv.setUint16(8, -1, le); // total number of entries in the central directory on this disk
    hv.setUint16(10, -1, le); // total number of entries in the central directory
    hv.setUint32(12, -1, le); // size of the central directory
    hv.setUint32(16, -1, le); // offset of start of central directory with respect to the starting disk number
    hv.setUint16(20, 0, le); // .ZIP file comment length
    yield hbuf.slice(0, 22); // TODO subarray
  
    // yield new Uint8Array(0); // .ZIP file comment       (variable size)
  }
  
  function crc32calc(msg, initial = 0) {
    let crc = initial ^ -1;
    for (let i = 0; i < msg.length; i++) {
      let b = (crc ^ msg[i]) & 0xff;
      for (let j = 0; j < 8; j++) {
        b = (b & 1 && 0xedb88320) ^ b >>> 1;
      }
      crc = crc >>> 8 ^ b;
    }
    return crc ^ -1;
  }
  