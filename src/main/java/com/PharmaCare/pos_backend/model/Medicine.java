package com.PharmaCare.pos_backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "medicines", schema = "spotmedpharmacare")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Medicine {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = true) // Changed to nullable
    private String genericName;

    @Column(nullable = false)
    private String category;

    @Column(nullable = true) // Changed to nullable (can be blank)
    private String manufacturer;

    @Column(nullable = true) // Changed to nullable (can be blank)
    private String batchNumber;

    @Column(nullable = true) // Changed to nullable (can be blank)
    private LocalDate expiryDate;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Builder.Default
    private int stockQuantity = 0;

    @Builder.Default
    private int reorderLevel = 50;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "supplier_id")
    private Supplier supplier;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal costPrice;

    @Column(columnDefinition = "TEXT")
    private String imageUrl;

    @Column(name = "is_active")
    @Builder.Default
    private boolean active = true;

    @OneToMany(mappedBy = "medicine", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<MedicineUnit> units = new ArrayList<>();

    // New fields from your TypeScript interface
    @Column(nullable = true)
    private String productType; // 'tablets', 'syrup', etc.

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    private void validateExpiryDate() {
        // Only validate if expiry date is provided
        if (expiryDate != null && expiryDate.isBefore(LocalDate.now())) {
            throw new IllegalArgumentException("Medicine has expired");
        }
    }

    public boolean isActive() {
        return active;
    }

    public void setIsActive(boolean active) {
        this.active = active;
    }

    @Override
    public String toString() {
        return "Medicine{" +
                "id=" + id +
                ", name='" + name + '\'' +
                ", category='" + category + '\'' +
                ", batchNumber='" + batchNumber + '\'' +
                ", stockQuantity=" + stockQuantity +
                ", active=" + active +
                '}';
    }
}