package com.PharmaCare.pos_backend.config;

import com.PharmaCare.pos_backend.enums.Role;
import com.PharmaCare.pos_backend.model.User;
import com.PharmaCare.pos_backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class DataInitializer {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final DefaultAdminConfig defaultAdminConfig;

    @Bean
    CommandLineRunner initDatabase() {
        return args -> {
            createOrUpdateDefaultAdmin();
            logDefaultAdminCredentials();
        };
    }

    private void createOrUpdateDefaultAdmin() {
        String email = defaultAdminConfig.getEmail();
        String rawPassword = defaultAdminConfig.getPassword();
        String encodedPassword = passwordEncoder.encode(rawPassword);

        log.info("=== ADMIN SETUP ===");
        log.info("Email from config: {}", email);
        log.info("Password from config: {}", rawPassword);
        log.info("Encoded password: {}", encodedPassword);
        log.info("==================");

        // Check if admin already exists
        userRepository.findByEmail(email).ifPresentOrElse(
                existingUser -> {
                    // Update existing admin with correct password
                    log.info("Admin user with email {} already exists. Updating password...", email);

                    // Check if password needs to be updated
                    if (!passwordEncoder.matches(rawPassword, existingUser.getPassword())) {
                        existingUser.setPassword(encodedPassword);
                        existingUser.setActive(true);
                        existingUser.setName(defaultAdminConfig.getName());
                        existingUser.setPhone(defaultAdminConfig.getPhone());
                        userRepository.save(existingUser);
                        log.info("✅ Admin password updated successfully!");
                    } else {
                        log.info("Admin password is already correct.");
                    }
                },
                () -> {
                    // Create new admin
                    log.info("Creating new admin user with email: {}", email);
                    User admin = User.builder()
                            .name(defaultAdminConfig.getName())
                            .email(email)
                            .password(encodedPassword)
                            .role(Role.ADMIN)
                            .phone(defaultAdminConfig.getPhone())
                            .isActive(defaultAdminConfig.isEnabled())
                            .build();

                    userRepository.save(admin);
                    log.info("✅ Default admin user created with email: {}", email);
                }
        );
    }

    private void logDefaultAdminCredentials() {
        log.info("=========================================");
        log.info("DEFAULT ADMIN CREDENTIALS:");
        log.info("Email: {}", defaultAdminConfig.getEmail());
        log.info("Password: {}", defaultAdminConfig.getPassword());
        log.info("Role: ADMIN");
        log.info("Active: {}", defaultAdminConfig.isEnabled());
        log.info("=========================================");
    }
}