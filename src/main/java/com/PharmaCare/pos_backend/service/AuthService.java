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
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider jwtTokenProvider;
    private final UserService userService;
    private final UserDetailsServiceImpl userDetailsService;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        log.info("Registering new user with email: {}", request.getEmail());

        if (userRepository.existsByEmail(request.getEmail())) {
            throw new ApiException("Email already registered", HttpStatus.BAD_REQUEST);
        }

        User user = User.builder()
                .name(request.getName())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .role(request.getRole())
                .phone(request.getPhone())
                .active(true)
                .build();

        User savedUser = userRepository.save(user);
        log.info("User registered successfully with ID: {}", savedUser.getId());

        String token = jwtTokenProvider.generateToken(savedUser);
        String refreshToken = jwtTokenProvider.generateRefreshToken(savedUser);

        return AuthResponse.builder()
                .user(userService.mapToUserResponse(savedUser))
                .token(token)
                .refreshToken(refreshToken)
                .build();
    }

    public AuthResponse login(LoginRequest request) {
        log.info("=== LOGIN ATTEMPT ===");
        log.info("Email: {}", request.getEmail());

        try {
            // Direct database check first
            User user = userRepository.findByEmail(request.getEmail())
                    .orElseThrow(() -> new UnauthorizedException("Invalid email or password"));

            // Check password
            if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
                throw new UnauthorizedException("Invalid email or password");
            }

            // Check if user is enabled
            if (!user.isEnabled()) {
                throw new ApiException("Account is disabled", HttpStatus.UNAUTHORIZED);
            }

            // SIMPLIFIED: Skip authenticationManager to avoid recursion
            // Just load user details and generate token
            UserDetails userDetails = userDetailsService.loadUserByUsername(request.getEmail());

            // Set authentication manually
            Authentication authentication = new UsernamePasswordAuthenticationToken(
                    userDetails,
                    null,
                    userDetails.getAuthorities()
            );
            SecurityContextHolder.getContext().setAuthentication(authentication);

            // Generate tokens
            String token = jwtTokenProvider.generateToken(user);
            String refreshToken = jwtTokenProvider.generateRefreshToken(user);

            log.info("✅ LOGIN SUCCESSFUL: {}", user.getEmail());

            // Use simplified user response creation
            UserResponse userResponse = createUserResponse(user);

            return AuthResponse.builder()
                    .user(userResponse)
                    .token(token)
                    .refreshToken(refreshToken)
                    .build();

        } catch (Exception e) {
            log.error("Login error: {}", e.getMessage());
            throw new UnauthorizedException("Invalid email or password");
        }
    }

    // Helper method to avoid circular dependency with UserService
    private UserResponse createUserResponse(User user) {
        if (user == null) return null;

        return UserResponse.builder()
                .id(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .role(user.getRole())
                .phone(user.getPhone())
                .isActive(user.isEnabled())
                .createdAt(user.getCreatedAt())
                .updatedAt(user.getUpdatedAt())
                .build();
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
    public void changePassword(String userId, ChangePasswordRequest request) {
        log.info("Changing password for user ID: {}", userId);

        User user = userRepository.findById(java.util.UUID.fromString(userId))
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            log.error("Current password incorrect for user ID: {}", userId);
            throw new ApiException("Current password is incorrect", HttpStatus.BAD_REQUEST);
        }

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

        String email = authentication.getName();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new UnauthorizedException("User not found"));

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