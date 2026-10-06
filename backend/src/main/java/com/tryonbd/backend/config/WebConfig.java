package com.tryonbd.backend.config;
import org.springframework.context.annotation.*;
import org.springframework.web.cors.*;
@Configuration
public class WebConfig {
 @Bean CorsConfigurationSource corsConfigurationSource() {
  var c = new CorsConfiguration();
  c.setAllowedOrigins(java.util.List.of("http://127.0.0.1:5173", "http://localhost:5173"));
  c.setAllowedMethods(java.util.List.of("GET","POST","PUT","DELETE","OPTIONS"));
  c.setAllowedHeaders(java.util.List.of("Authorization","Content-Type"));
  var source = new UrlBasedCorsConfigurationSource();
  // Public cutout PNGs must remain readable by anonymous canvas/CORS loaders.
  // Keep this rule separate from the existing authenticated API origin policy.
  var assets = new CorsConfiguration();
  assets.setAllowedOrigins(java.util.List.of("*"));
  assets.setAllowedMethods(java.util.List.of("GET", "HEAD"));
  assets.setAllowedHeaders(java.util.List.of("Content-Type"));
  assets.setAllowCredentials(false);
  source.registerCorsConfiguration("/assets/products/**", assets);
  source.registerCorsConfiguration("/**", c); return source;
 }
}
