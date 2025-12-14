package com.PharmaCare.pos_backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {
    private com.PharmaCare.pos_backend.dto.response.UserResponse user;
    private String token;
    private String refreshToken;
}