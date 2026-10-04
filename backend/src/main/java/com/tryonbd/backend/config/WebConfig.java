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
  var source = new UrlBasedCorsConfigurationSource(); source.registerCorsConfiguration("/**", c); return source;
 }
}
