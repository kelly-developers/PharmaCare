package com.PharmaCare.pos_backend.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "admin.default")
@Data
public class DefaultAdminConfig {
    private String email = "kellynyachiro@gmail.com";
    private String password = "Kelly@40125507";  // Set default value
    private String name = "System Administrator";
    private String phone = "+254700000000";
    private boolean enabled = true;
}