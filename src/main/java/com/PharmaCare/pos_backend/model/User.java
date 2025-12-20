package com.PharmaCare.pos_backend.model;

import com.PharmaCare.pos_backend.enums.Role;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "users", schema = "patientcare") // Added schema
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User implements UserDetails {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String password;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    private String phone;

    @Column(name = "is_active") // Match column name
    private boolean active = true; // Renamed from isActive to active

    @CreationTimestamp
    @Column(name = "created_at", updatable = false) // Match column name
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at") // Match column name
    private LocalDateTime updatedAt;

    // CRITICAL FIX: Add @Builder.Default annotation to collections
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return active;
    }

    // Add getter for compatibility
    public boolean getIsActive() {
        return active;
    }

    // Add setter for compatibility
    public void setIsActive(boolean active) {
        this.active = active;
    }
}