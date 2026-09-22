package cn.keking.desktop;

import cn.keking.config.ConfigConstants;
import cn.keking.model.FileAttribute;
import cn.keking.model.FileType;
import cn.keking.service.FileHandlerService;
import cn.keking.web.filter.BaseUrlFilter;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.net.URLEncoder;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Native 7-Zip adapter for architectures unavailable in upstream JNI. */
public final class DesktopArchive {
  private static String run(List<String> arguments) throws Exception {
    Path log = Files.createTempFile("lanyue-7zip-", ".txt");
    Process process = null;
    try {
      process = new ProcessBuilder(arguments).redirectErrorStream(true).redirectOutput(log.toFile()).start();
      process.getOutputStream().close();
      if (!process.waitFor(120, TimeUnit.SECONDS)) { process.destroyForcibly(); throw new Exception("压缩包处理超时"); }
      if (Files.size(log) > 32 * 1024 * 1024) throw new Exception("压缩包目录过大");
      String text = Files.readString(log, StandardCharsets.UTF_8);
      if (process.exitValue() != 0) {
        if (text.contains("Wrong password") || text.contains("password") || text.contains("encrypted")) throw new Exception("Password");
        throw new Exception("压缩包损坏或格式不受支持");
      }
      return text;
    } finally { if (process != null && process.isAlive()) process.destroyForcibly(); Files.deleteIfExists(log); }
  }
  public static String extract(String filePath, String password, String fileName, FileAttribute attribute, FileHandlerService handler) throws Exception {
    String exe = System.getenv("LANYUE_7ZIP");
    Path root = Paths.get(ConfigConstants.getFileDir()).toAbsolutePath().normalize();
    Path input = Paths.get(filePath).toAbsolutePath().normalize();
    if (!input.startsWith(root)) throw new SecurityException("Invalid archive path");
    String relative = root.relativize(input).toString();
    String folderName = (attribute.isCompressFile() ? "_decompression" : "") + relative + "_";
    Path output = root.resolve(folderName).normalize();
    if (!output.startsWith(root)) throw new SecurityException("Invalid extraction path");
    String pass = "-p" + (password == null || password.isEmpty() ? UUID.randomUUID().toString() : password);
    String listing = run(List.of(exe, "l", "-slt", "-ba", "-sccUTF-8", pass, "--", input.toString()));
    long total = 0; int entries = 0; String currentEntry = null; List<String> links = new ArrayList<>();
    for (String line : listing.split("\\R")) {
      if (line.startsWith("Path = ")) {
        String entry = line.substring(7).replace('\\', '/');
        currentEntry = entry;
        Path target = output.resolve(entry).normalize();
        if (entry.startsWith("/") || entry.matches("^[A-Za-z]:.*") || !target.startsWith(output)) throw new SecurityException("压缩包包含不安全路径");
        if (++entries > 100000) throw new Exception("压缩包条目过多");
      }
      if (((line.startsWith("Symbolic Link = ") || line.startsWith("Hard Link = ")) && !line.substring(line.indexOf('=') + 1).isBlank()) || line.matches("Attributes = .*l[rwx-]{9}.*") || line.matches("Mode = l.*")) {
        if (currentEntry == null) throw new SecurityException("无效链接条目");
        links.add(currentEntry);
      }
      if (line.startsWith("Size = ")) { try { total = Math.addExact(total, Long.parseLong(line.substring(7).trim())); } catch (RuntimeException e) { throw new Exception("无效的压缩包大小"); } }
      if (total > 10L * 1024 * 1024 * 1024) throw new Exception("压缩包展开后超过 10 GB");
    }
    // A fresh directory ensures an earlier preview cannot leave links behind.
    if (Files.exists(output)) try (var stream = Files.walk(output)) { for (Path item : stream.sorted(Comparator.reverseOrder()).toList()) Files.delete(item); }
    Files.createDirectories(output);
    List<String> args = new ArrayList<>(List.of(exe, "x", "-y", "-aoa", "-spd", "-sccUTF-8", pass, "-o" + output));
    for (String link : links) args.add("-x!" + link);
    args.add("--"); args.add(input.toString()); run(args);
    for (String link : links) { Path placeholder = output.resolve(link).normalize(); Files.createDirectories(placeholder.getParent()); if (!Files.exists(placeholder)) Files.writeString(placeholder, "此条目是压缩包中的文件链接。为保护本机文件，预览时未展开链接。", StandardCharsets.UTF_8); }
    List<String> images = new ArrayList<>();
    try (var stream = Files.walk(output)) {
      for (Path item : stream.toList()) {
        if (Files.isSymbolicLink(item)) throw new SecurityException("压缩包包含链接");
        if (Files.isRegularFile(item) && FileType.typeFromFileName(item.getFileName().toString()) == FileType.PICTURE)
          images.add(BaseUrlFilter.getBaseUrl() + URLEncoder.encode(root.relativize(item).toString().replace('\\','/'), StandardCharsets.UTF_8).replace("%2F", "/"));
      }
    }
    handler.putImgCache(fileName + "_", images);
    return folderName.replace('\\', '/');
  }
}
