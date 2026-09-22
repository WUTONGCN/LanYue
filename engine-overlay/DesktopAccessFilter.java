package cn.keking.desktop;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

/** Desktop-only boundary. Never enabled in an unmodified server installation. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class DesktopAccessFilter extends OncePerRequestFilter {
  @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String secret = System.getenv("LANYUE_ENGINE_TOKEN");
    if (secret == null || secret.isEmpty()) { response.sendError(503); return; }
    String supplied = request.getHeader("X-LanYue-Token");
    if (supplied == null || !MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8))) {
      response.sendError(403); return;
    }
    // Preview navigation may only address the selected-file broker or this cache server.
    for (String key : new String[]{"url", "urlPath"}) {
      String raw = request.getParameter(key);
      if (raw != null) {
        try {
          String decoded = new String(Base64.getDecoder().decode(raw), StandardCharsets.UTF_8);
          URI uri = URI.create(decoded);
          String query = uri.getRawQuery();
          if (query != null) for (String parameter : query.split("&")) {
            if (parameter.startsWith("fullfilename=")) {
              String name = java.net.URLDecoder.decode(parameter.substring(13), StandardCharsets.UTF_8);
              if (name.contains("/") || name.contains("\\") || name.contains("\u0000") || name.equals("..")) { response.sendError(403); return; }
            }
          }
          String origin = uri.getScheme() + "://" + uri.getRawAuthority();
          if (!origin.equals(System.getenv("LANYUE_SOURCE_ORIGIN")) && !origin.equals("http://127.0.0.1:" + request.getLocalPort())) {
            response.sendError(403); return;
          }
        } catch (IllegalArgumentException e) { response.sendError(400); return; }
      }
    }
    response.setHeader("Referrer-Policy", "no-referrer");
    chain.doFilter(request, response);
  }
}
