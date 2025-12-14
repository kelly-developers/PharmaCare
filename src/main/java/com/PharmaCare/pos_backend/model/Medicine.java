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
@Table(name = "medicines")
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

    private String genericName;

    @Column(nullable = false)
    private String category;

    private String manufacturer;

    @Column(nullable = false)
    private String batchNumber;

    @Column(nullable = false)
    private LocalDate expiryDate;

    @Builder.Default
    private int stockQuantity = 0;

    @Builder.Default
    private int reorderLevel = 50;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "supplier_id")
    private Supplier supplier;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal costPrice;

    private String imageUrl;

    @Builder.Default
    private boolean isActive = true;

    @OneToMany(mappedBy = "medicine", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<MedicineUnit> units = new ArrayList<>();

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    private void validateExpiryDate() {
        if (expiryDate.isBefore(LocalDate.now())) {
            throw new IllegalArgumentException("Medicine has expired");
        }
    }
}

///