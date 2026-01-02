package com.PharmaCare.pos_backend.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AuthResponse {
    private UserResponse user;
    private String token;
    private String refreshToken;

    // Add safe   toString() to prevent recursion
    @Override
    public String toString() {
        return "AuthResponse{" +
                "user=" + (user != null ? user.getEmail() : "null") +
                ", token=" + (token != null ? "***" + (token.length() > 10 ? token.substring(token.length() - 10) : token) : "null") +
                ", refreshToken=" + (refreshToken != null ? "***" + (refreshToken.length() > 10 ? refreshToken.substring(refreshToken.length() - 10) : refreshToken) : "null") +
                '}';
    }
}