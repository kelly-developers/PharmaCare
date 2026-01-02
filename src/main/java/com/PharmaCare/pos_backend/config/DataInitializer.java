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
        log.info("Email: {}", email);
        log.info("Raw Password: {}", rawPassword);
        log.info("Encoded Password: {}", encodedPassword);
        log.info("==================");

        userRepository.findByEmail(email).ifPresentOrElse(
                existingUser -> {
                    log.info("Admin user with email {} already exists", email);

                    // Always update password to ensure it's correct
                    if (!passwordEncoder.matches(rawPassword, existingUser.getPassword())) {
                        existingUser.setPassword(encodedPassword);
                        existingUser.setActive(true);
                        existingUser.setName(defaultAdminConfig.getName());
                        existingUser.setPhone(defaultAdminConfig.getPhone());
                        userRepository.save(existingUser);
                        log.info("✅ Admin password updated!");
                    } else {
                        log.info("Admin password is already correct");
                    }
                },
                () -> {
                    log.info("Creating new admin user...");
                    User admin = User.builder()
                            .name(defaultAdminConfig.getName())
                            .email(email)
                            .password(encodedPassword)
                            .role(Role.ADMIN)
                            .phone(defaultAdminConfig.getPhone())
                            .active(defaultAdminConfig.isEnabled())
                            .build();

                    userRepository.save(admin);
                    log.info("✅ Default admin user created");
                }
        );
    }

    private void logDefaultAdminCredentials() {
        log.info("=========================================");
        log.info("DEFAULT ADMIN CREDENTIALS:");
        log.info("Email: {}", defaultAdminConfig.getEmail());
        log.info("Password: {}", defaultAdminConfig.getPassword());
        log.info("Name: {}", defaultAdminConfig.getName());
        log.info("Phone: {}", defaultAdminConfig.getPhone());
        log.info("Role: ADMIN");
        log.info("Active: {}", defaultAdminConfig.isEnabled());
        log.info("=========================================");
    }
}