package com.PharmaCare.pos_backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import jakarta.annotation.PostConstruct;
import java.util.TimeZone;

@Configuration
public class TimezoneConfig implements WebMvcConfigurer {

    @PostConstruct
    public void init() {
        // Set the default timezone to East Africa Time (Kenya)
        TimeZone.setDefault(TimeZone.getTimeZone("Africa/Nairobi"));
        System.out.println("Application timezone set to: " + TimeZone.getDefault().getID());
    }
}