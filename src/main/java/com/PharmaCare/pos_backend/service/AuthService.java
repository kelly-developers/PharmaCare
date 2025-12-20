package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.config.JwtTokenProvider;
import com.PharmaCare.pos_backend.dto.request.ChangePasswordRequest;
import com.PharmaCare.pos_backend.dto.request.LoginRequest;
import com.PharmaCare.pos_backend.dto.request.RegisterRequest;
import com.PharmaCare.pos_backend.dto.response.AuthResponse;
import com.PharmaCare.pos_backend.dto.response.UserResponse;
import com.PharmaCare.pos_backend.model.User;
import com.PharmaCare.pos_backend.exception.ApiException;
import com.PharmaCare.pos_backend.exception.ResourceNotFoundException;
import com.PharmaCare.pos_backend.exception.UnauthorizedException;
import com.PharmaCare.pos_backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider jwtTokenProvider;
    private final UserService userService;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        log.info("Registering new user with email: {}", request.getEmail());

        // Check if user already exists
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new ApiException("Email already registered", HttpStatus.BAD_REQUEST);
        }

        // Create new user
        User user = User.builder()
                .name(request.getName())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .role(request.getRole())
                .phone(request.getPhone())
                .isActive(true)
                .build();

        User savedUser = userRepository.save(user);
        log.info("User registered successfully with ID: {}", savedUser.getId());

        // Generate tokens
        String token = jwtTokenProvider.generateToken(savedUser);
        String refreshToken = jwtTokenProvider.generateRefreshToken(savedUser);

        return AuthResponse.builder()
                .user(userService.mapToUserResponse(savedUser))
                .token(token)
                .refreshToken(refreshToken)
                .build();
    }

    public AuthResponse login(LoginRequest request) {
        log.info("=== LOGIN ATTEMPT START ===");
        log.info("Email: {}", request.getEmail());

        // DEBUG: Check if user exists in database
        log.debug("1. Checking database for user...");
        Optional<User> optionalUser = userRepository.findByEmail(request.getEmail());

        if (optionalUser.isEmpty()) {
            log.error("❌ User not found in database: {}", request.getEmail());
            throw new UnauthorizedException("Invalid email or password");
        }

        User dbUser = optionalUser.get();
        log.debug("✅ User found in database:");
        log.debug("   - Email: {}", dbUser.getEmail());
        log.debug("   - Name: {}", dbUser.getName());
        log.debug("   - Role: {}", dbUser.getRole());
        log.debug("   - Active: {}", dbUser.isEnabled());
        log.debug("   - Password hash length: {}", dbUser.getPassword().length());
        log.debug("   - Password hash prefix: {}", dbUser.getPassword().substring(0, 30));

        // DEBUG: Manual password check
        log.debug("2. Manual password check...");
        boolean passwordMatches = passwordEncoder.matches(request.getPassword(), dbUser.getPassword());
        log.debug("   Password '{}' matches hash: {}", request.getPassword(), passwordMatches);

        if (!passwordMatches) {
            log.error("❌ Password mismatch for user: {}", request.getEmail());
            log.debug("   Provided password: '{}'", request.getPassword());
            log.debug("   Stored hash: {}", dbUser.getPassword());
            throw new UnauthorizedException("Invalid email or password");
        }

        // DEBUG: Check if user is enabled
        if (!dbUser.isEnabled()) {
            log.error("❌ User account is disabled: {}", request.getEmail());
            throw new ApiException("Account is disabled", HttpStatus.UNAUTHORIZED);
        }

        try {
            log.debug("3. Attempting Spring Security authentication...");
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
            );

            log.debug("✅ Authentication successful!");
            SecurityContextHolder.getContext().setAuthentication(authentication);

            User user = (User) authentication.getPrincipal();
            log.debug("   Authenticated user: {}", user.getEmail());
            log.debug("   User authorities: {}", user.getAuthorities());

            // Generate tokens
            String token = jwtTokenProvider.generateToken(user);
            String refreshToken = jwtTokenProvider.generateRefreshToken(user);

            log.debug("4. Tokens generated:");
            log.debug("   Token length: {}", token.length());
            log.debug("   Refresh token length: {}", refreshToken.length());

            log.info("✅ LOGIN SUCCESSFUL: {}", user.getEmail());
            log.info("=== LOGIN ATTEMPT END ===");

            return AuthResponse.builder()
                    .user(userService.mapToUserResponse(user))
                    .token(token)
                    .refreshToken(refreshToken)
                    .build();
        } catch (Exception e) {
            log.error("❌ AuthenticationManager authentication failed:", e);
            log.error("   Email: {}", request.getEmail());
            log.error("   Exception type: {}", e.getClass().getName());
            log.error("   Exception message: {}", e.getMessage());
            throw new UnauthorizedException("Invalid email or password");
        }
    }

    public void logout() {
        log.info("User logout");
        SecurityContextHolder.clearContext();
    }

    @Transactional
    public String refreshToken(String refreshToken) {
        log.debug("Refreshing token...");
        try {
            String email = jwtTokenProvider.extractUsername(refreshToken);
            User user = userRepository.findByEmail(email)
                    .orElseThrow(() -> new ResourceNotFoundException("User", "email", email));

            if (jwtTokenProvider.isTokenValid(refreshToken, user)) {
                String newToken = jwtTokenProvider.generateToken(user);
                log.debug("Token refreshed successfully for: {}", email);
                return newToken;
            } else {
                log.error("Invalid refresh token for: {}", email);
                throw new UnauthorizedException("Invalid refresh token");
            }
        } catch (Exception e) {
            log.error("Token refresh failed", e);
            throw new UnauthorizedException("Invalid refresh token");
        }
    }

    @Transactional
    public void changePassword(UUID userId, ChangePasswordRequest request) {
        log.info("Changing password for user ID: {}", userId);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        // Verify current password
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            log.error("Current password incorrect for user ID: {}", userId);
            throw new ApiException("Current password is incorrect", HttpStatus.BAD_REQUEST);
        }

        // Update password
        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);

        log.info("Password changed successfully for user ID: {}", userId);
    }

    @Transactional
    public void resetPassword(String email, String newPassword) {
        log.info("Resetting password for: {}", email);

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("User", "email", email));

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        log.info("Password reset successfully for: {}", email);
    }

    public UserResponse getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            log.warn("Attempt to get current user without authentication");
            throw new UnauthorizedException("User not authenticated");
        }

        User user = (User) authentication.getPrincipal();
        log.debug("Getting current user: {}", user.getEmail());
        return userService.mapToUserResponse(user);
    }

    public boolean validateToken(String token) {
        try {
            String email = jwtTokenProvider.extractUsername(token);
            User user = userRepository.findByEmail(email)
                    .orElseThrow(() -> new ResourceNotFoundException("User", "email", email));
            boolean isValid = jwtTokenProvider.isTokenValid(token, user);
            log.debug("Token validation for {}: {}", email, isValid);
            return isValid;
        } catch (Exception e) {
            log.debug("Token validation failed: {}", e.getMessage());
            return false;
        }
    }
}