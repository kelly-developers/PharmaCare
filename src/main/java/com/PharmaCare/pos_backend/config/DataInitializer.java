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
            createDefaultAdmin();
            logDefaultAdminCredentials();
        };
    }

    private void createDefaultAdmin() {
        String email = defaultAdminConfig.getEmail();

        // Check if admin already exists
        if (userRepository.findByEmail(email).isEmpty()) {
            User admin = User.builder()
                    .name(defaultAdminConfig.getName() != null ?
                            defaultAdminConfig.getName() : "System Administrator")
                    .email(email)
                    .password(passwordEncoder.encode(defaultAdminConfig.getPassword()))
                    .role(Role.ADMIN)
                    .phone(defaultAdminConfig.getPhone() != null ?
                            defaultAdminConfig.getPhone() : "+254700000000")
                    .isActive(defaultAdminConfig.isEnabled())
                    .build();

            userRepository.save(admin);
            log.info("Default admin user created with email: {}", email);
        } else {
            log.info("Admin user with email {} already exists", email);
        }
    }

    private void logDefaultAdminCredentials() {
        log.info("=========================================");
        log.info("DEFAULT ADMIN CREDENTIALS:");
        log.info("Email: {}", defaultAdminConfig.getEmail());
        log.info("Password: {}", defaultAdminConfig.getPassword());
        log.info("Role: ADMIN");
        log.info("=========================================");
    }
}