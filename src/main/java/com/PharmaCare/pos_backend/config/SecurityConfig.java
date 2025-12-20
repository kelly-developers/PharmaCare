package com.PharmaCare.pos_backend.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    // List of public endpoints that don't require authentication
    private static final String[] PUBLIC_ENDPOINTS = {
            // Auth endpoints
            "/api/auth/**",

            // Public API endpoints (if any)
            "/api/public/**",

            // Swagger/OpenAPI documentation
            "/swagger-ui/**",
            "/v3/api-docs/**",
            "/api-docs/**",
            "/swagger-resources/**",
            "/webjars/**",

            // Health check endpoints
            "/actuator/health",
            "/health",
            "/",

            // Error pages
            "/error",

            // Favicon
            "/favicon.ico"
    };

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Public endpoints
                        .requestMatchers(PUBLIC_ENDPOINTS).permitAll()

                        // Medicine related endpoints
                        .requestMatchers("/medicines/**").authenticated()
                        .requestMatchers("/api/medicines/**").authenticated()

                        // Sales endpoints
                        .requestMatchers("/sales/**").authenticated()
                        .requestMatchers("/api/sales/**").authenticated()

                        // Prescription endpoints
                        .requestMatchers("/prescriptions/**").authenticated()
                        .requestMatchers("/api/prescriptions/**").authenticated()

                        // Stock endpoints
                        .requestMatchers("/stock/**").authenticated()
                        .requestMatchers("/api/stock/**").authenticated()

                        // Expense endpoints
                        .requestMatchers("/expenses/**").authenticated()
                        .requestMatchers("/api/expenses/**").authenticated()

                        // Category endpoints
                        .requestMatchers("/categories/**").authenticated()
                        .requestMatchers("/api/categories/**").authenticated()

                        // User management endpoints
                        .requestMatchers("/users/**").hasRole("ADMIN")
                        .requestMatchers("/api/users/**").hasRole("ADMIN")

                        // Customer endpoints
                        .requestMatchers("/customers/**").authenticated()
                        .requestMatchers("/api/customers/**").authenticated()

                        // Supplier endpoints
                        .requestMatchers("/suppliers/**").authenticated()
                        .requestMatchers("/api/suppliers/**").authenticated()

                        // Reports endpoints
                        .requestMatchers("/reports/**").authenticated()
                        .requestMatchers("/api/reports/**").authenticated()

                        // Dashboard endpoints
                        .requestMatchers("/dashboard/**").authenticated()
                        .requestMatchers("/api/dashboard/**").authenticated()

                        // All other requests require authentication
                        .anyRequest().authenticated())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        // Allow specific origins (your frontend URLs)
        configuration.setAllowedOrigins(Arrays.asList(
                "https://pharmacares.netlify.app",
                "http://localhost:3000",  // For local development
                "http://localhost:5173"   // For Vite dev server
        ));

        // Allow all HTTP methods
        configuration.setAllowedMethods(Arrays.asList(
                "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"
        ));

        // Allow specific headers
        configuration.setAllowedHeaders(Arrays.asList(
                "Authorization",
                "Content-Type",
                "X-Requested-With",
                "Accept",
                "Origin",
                "Access-Control-Request-Method",
                "Access-Control-Request-Headers",
                "Cache-Control"
        ));

        // Expose headers to the client
        configuration.setExposedHeaders(Arrays.asList(
                "Authorization",
                "Content-Type",
                "Access-Control-Allow-Origin",
                "Access-Control-Allow-Credentials"
        ));

        // Allow credentials (cookies, authorization headers)
        configuration.setAllowCredentials(true);

        // Cache preflight response for 1 hour (3600 seconds)
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}