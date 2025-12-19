package com.PharmaCare.pos_backend.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "admin.default")
@Data
public class DefaultAdminConfig {
    private String email;
    private String password;
    private String name;
    private String phone;
    private boolean enabled = true;
}